import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import StudioSidebar from "@/components/studio/StudioSidebar";
import StudioWorkspace from "@/components/studio/StudioWorkspace";
import SettingsModal from "@/components/studio/SettingsModal";
import QuoteConfirmation from "@/components/studio/QuoteConfirmation";
import type { AtlasConnection } from "@/lib/atlasConnection";
import {
  activateSession,
  addGenerationJob,
  addSession,
  createArtifact,
  createGenerationJob,
  createMessage,
  createReference,
  createSession,
  deleteSession,
  loadStudioStore,
  normalizeGenerationStatus,
  recoverableJobs,
  renameSession,
  saveStudioStore,
  titleFromPrompt,
  updateGenerationJob,
  updateSession,
  type GenerationJob,
  type GenerationQuote,
  type StudioArtifact,
  type StudioMode,
  type StudioReference,
  type StudioSession,
  type StudioStore,
} from "@/lib/studioStore";
import {
  defaultModelForMode,
  defaultParamsForModel,
  getAtlasModel,
  modelsForMode,
  validateModelParams,
  type AtlasParameterValue,
} from "@shared/atlasModels";
import { getReferenceCapabilities } from "@shared/atlasReferenceModels";

type PendingGeneration = {
  sessionId: string;
  kind: "image" | "video";
  model: string;
  prompt: string;
  params: Record<string, AtlasParameterValue>;
  references: StudioReference[];
  finalFrame?: StudioReference;
  quote: GenerationQuote;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function outputUrl(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return typeof item.url === "string"
      ? item.url
      : typeof item.output === "string"
        ? item.output
        : null;
  }
  return null;
}

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not read the selected image."));
    reader.onerror = () => reject(reader.error || new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Could not encode the selected image.");
  return dataUrl.slice(comma + 1);
}

export default function Home() {
  const [studio, setStudio] = useState<StudioStore>(() => loadStudioStore());
  const [apiKey, setApiKey] = useState(() => typeof window !== "undefined" ? localStorage.getItem("atlas_api_key") || "" : "");
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [settings, setSettings] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== "undefined" && localStorage.getItem("atlas_sidebar_collapsed") === "1");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration>();
  const [connection, setConnection] = useState<AtlasConnection>(() => ({ status: apiKey ? "checking" : "missing" }));
  const polling = useRef(new Set<string>());
  const checkedKey = useRef<string | undefined>(undefined);

  const active = useMemo(
    () => studio.sessions.find((session) => session.id === studio.activeSessionId) ?? studio.sessions[0],
    [studio],
  );
  const models = useMemo(() => modelsForMode(active.mode), [active.mode]);
  const referenceCapabilities = useMemo(
    () => getReferenceCapabilities(active.selectedModel),
    [active.selectedModel],
  );
  const activeJobs = useMemo(() => studio.jobs.filter((job) => job.sessionId === active.id), [active.id, studio.jobs]);
  const chatMutation = trpc.atlas.chat.useMutation();
  const imageMutation = trpc.atlas.generateImage.useMutation();
  const videoMutation = trpc.atlas.generateVideo.useMutation();
  const uploadMutation = trpc.atlas.uploadMedia.useMutation();
  const calculateMutation = trpc.atlas.calculate.useMutation();
  const validateKeyMutation = trpc.atlas.validateKey.useMutation();
  const utils = trpc.useUtils();

  const verifyKey = useCallback(async (value: string) => {
    if (!value) {
      setConnection({ status: "missing" });
      return;
    }
    checkedKey.current = value;
    setConnection({ status: "checking" });
    try {
      const result = await validateKeyMutation.mutateAsync({ apiKey: value });
      if (!result.valid) {
        setConnection({ status: "invalid" });
      } else if (!result.billingAccess) {
        setConnection({ status: "limited" });
      } else {
        setConnection({ status: "connected", balance: result.balance, currency: result.currency });
      }
    } catch (error) {
      setConnection({ status: "unreachable", message: errorMessage(error, "Atlas could not be reached from this server.") });
    }
  }, [validateKeyMutation]);

  useEffect(() => {
    if (apiKey && checkedKey.current !== apiKey) void verifyKey(apiKey);
  }, [apiKey, verifyKey]);

  const commitStore = useCallback((updater: (current: StudioStore) => StudioStore) => {
    setStudio((current) => {
      const next = updater(current);
      saveStudioStore(next);
      return next;
    });
  }, []);

  const updateActive = useCallback(
    (updater: (session: StudioSession) => StudioSession) =>
      commitStore((current) => updateSession(current, current.activeSessionId, updater)),
    [commitStore],
  );

  const pollJob = useCallback(async (job: GenerationJob) => {
    if (!apiKey || !job.requestId || polling.current.has(job.requestId)) return;
    const requestId = job.requestId;
    polling.current.add(requestId);
    const delays = [1200, 2200, 3500, 5000, 7000];
    try {
      for (let attempt = 0; attempt < 36; attempt += 1) {
        const result = await utils.atlas.prediction.fetch({ apiKey, id: requestId });
        const status = normalizeGenerationStatus(result.status);
        if (status === "completed") {
          const url = outputUrl(result.outputs?.[0]);
          if (!url) throw new Error("Atlas completed without an output URL.");
          commitStore((current) => {
            const currentJob = current.jobs.find((item) => item.id === job.id);
            if (!currentJob || currentJob.status === "completed") return current;
            const artifact = createArtifact({
              kind: job.kind,
              url,
              prompt: job.prompt,
              model: job.model,
              params: job.params,
              generationJobId: job.id,
              references: job.references,
              finalFrame: job.finalFrame,
            });
            let next = updateSession(current, job.sessionId, (session) =>
              session.artifacts.some((item) => item.generationJobId === job.id)
                ? session
                : { ...session, artifacts: [artifact, ...session.artifacts] },
            );
            next = updateGenerationJob(next, job.id, {
              status: "completed",
              providerStatus: result.status,
              resultUrl: url,
              artifactId: artifact.id,
              error: undefined,
            });
            return next;
          });
          return;
        }
        if (status === "failed") {
          commitStore((current) => updateGenerationJob(current, job.id, {
            status: "failed",
            providerStatus: result.status,
            error: result.error || "Atlas generation failed.",
          }));
          return;
        }
        commitStore((current) => updateGenerationJob(current, job.id, {
          status,
          providerStatus: result.status,
        }));
        await new Promise((resolve) => window.setTimeout(
          resolve,
          delays[Math.min(attempt, delays.length - 1)],
        ));
      }
      commitStore((current) => updateGenerationJob(current, job.id, {
        status: "timed_out",
        providerStatus: "timed_out",
        error: "Automatic status checks timed out. The Atlas request ID is preserved; use Check now to resume.",
      }));
    } catch (error) {
      const message = errorMessage(error, "Status check failed");
      commitStore((current) => updateGenerationJob(current, job.id, { error: message }));
      toast.error(message);
    } finally {
      polling.current.delete(requestId);
    }
  }, [apiKey, commitStore, utils.atlas.prediction]);

  useEffect(() => {
    if (!apiKey) return;
    recoverableJobs(studio).forEach((job) => { void pollJob(job); });
  }, [apiKey, studio, pollJob]);

  const ensureKey = () => {
    if (apiKey && ["connected", "limited"].includes(connection.status)) return true;
    setKeyDraft(apiKey);
    setSettings(true);
    if (!apiKey) toast("Add an Atlas Cloud API key to run a request");
    else if (connection.status === "checking") toast("Wait for the Atlas connection check to finish");
    else toast.error("Verify the Atlas connection before sending a request");
    return false;
  };

  const saveKey = () => {
    const value = keyDraft.trim();
    if (value) localStorage.setItem("atlas_api_key", value);
    else localStorage.removeItem("atlas_api_key");
    setApiKey(value);
    setSettings(false);
    if (value) {
      toast.success("Atlas key saved locally; verifying connection…");
      void verifyKey(value);
    } else {
      setConnection({ status: "missing" });
      toast.success("Atlas key removed");
    }
  };

  const uploadImage = async (file: File): Promise<StudioReference> => {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
    if (file.size > 30 * 1024 * 1024) throw new Error(`${file.name} is larger than Atlas' 30 MB image limit.`);
    const base64 = await fileToBase64(file);
    const uploaded = await uploadMutation.mutateAsync({
      apiKey,
      fileName: file.name,
      mimeType: file.type || "image/png",
      base64,
    });
    return createReference({ url: uploaded.url, name: file.name, source: "upload" });
  };

  const uploadReferences = async (files: File[]) => {
    if (!ensureKey() || !files.length) return;
    const sessionId = active.id;
    const capacity = referenceCapabilities.maxReferences - active.references.length;
    if (capacity <= 0) {
      toast.error(`This model supports at most ${referenceCapabilities.maxReferences} image references.`);
      return;
    }
    if (files.length > capacity) {
      toast.error(`You can add ${capacity} more reference image${capacity === 1 ? "" : "s"}.`);
      return;
    }

    setUploadError(undefined);
    setUploading(true);
    try {
      const uploaded: StudioReference[] = [];
      for (const file of files) uploaded.push(await uploadImage(file));
      commitStore((current) => updateSession(current, sessionId, (session) => ({
        ...session,
        references: [...session.references, ...uploaded],
      })));
      toast.success(`${uploaded.length} reference${uploaded.length === 1 ? "" : "s"} added`);
    } catch (error) {
      const message = errorMessage(error, "Upload failed");
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const uploadFinalFrame = async (file: File) => {
    if (!ensureKey()) return;
    if (!referenceCapabilities.finalFrame) {
      toast.error("The selected model does not support a final frame.");
      return;
    }
    if (active.references.length !== 1) {
      toast.error("Seedance final frame requires exactly one starting image.");
      return;
    }
    const sessionId = active.id;
    setUploadError(undefined);
    setUploading(true);
    try {
      const finalFrame = await uploadImage(file);
      commitStore((current) => updateSession(current, sessionId, (session) => ({ ...session, finalFrame })));
      toast.success("Final frame added");
    } catch (error) {
      const message = errorMessage(error, "Upload failed");
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const addArtifactReference = (artifact: StudioArtifact) => {
    if (artifact.kind !== "image") return;
    const capabilities = getReferenceCapabilities(active.selectedModel);
    if (active.references.length >= capabilities.maxReferences) {
      toast.error(`This model supports at most ${capabilities.maxReferences} references.`);
      return;
    }
    if (active.references.some((reference) => reference.artifactId === artifact.id || reference.url === artifact.url)) {
      toast("That image is already in the reference list.");
      return;
    }
    const reference = createReference({
      url: artifact.url,
      name: artifact.prompt || "Generated image",
      source: "artifact",
      artifactId: artifact.id,
    });
    updateActive((session) => ({ ...session, references: [...session.references, reference] }));
    toast.success("Image added as reference");
  };

  const useArtifactAsFinalFrame = (artifact: StudioArtifact) => {
    if (artifact.kind !== "image") return;
    const finalFrame = createReference({
      url: artifact.url,
      name: artifact.prompt || "Generated image",
      source: "artifact",
      artifactId: artifact.id,
    });
    updateActive((session) => ({ ...session, finalFrame }));
    toast.success("Image saved as final frame for video");
  };

  const removeReference = (referenceId: string) => updateActive((session) => ({
    ...session,
    references: session.references.filter((reference) => reference.id !== referenceId),
  }));

  const moveReference = (referenceId: string, direction: -1 | 1) => updateActive((session) => {
    const index = session.references.findIndex((reference) => reference.id === referenceId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= session.references.length) return session;
    const references = [...session.references];
    [references[index], references[target]] = [references[target], references[index]];
    return { ...session, references };
  });

  const submit = async () => {
    const value = prompt.trim();
    if (!value || busy || !ensureKey()) return;
    setBusy(true);
    const shouldTitle = active.title === "Untitled session";
    try {
      const params = validateModelParams(active.selectedModel, active.params);
      if (active.mode === "chat") {
        const config = { model: active.selectedModel, params };
        const nextMessages = [...active.messages, createMessage("user", value, config)];
        updateActive((session) => ({
          ...session,
          title: shouldTitle ? titleFromPrompt(value) : session.title,
          messages: nextMessages,
        }));
        setPrompt("");
        const response = await chatMutation.mutateAsync({
          apiKey,
          model: active.selectedModel,
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          params,
        });
        updateActive((session) => ({
          ...session,
          messages: [...session.messages, createMessage("assistant", response.content)],
        }));
      } else {
        const kind = active.mode;
        const references = [...active.references];
        const finalFrame = kind === "video" ? active.finalFrame : undefined;
        const quote = await calculateMutation.mutateAsync({
          apiKey,
          kind,
          model: active.selectedModel,
          prompt: value,
          params,
          referenceUrls: references.map((reference) => reference.url),
          finalFrameUrl: finalFrame?.url,
        });
        setPendingGeneration({
          sessionId: active.id,
          kind,
          model: active.selectedModel,
          prompt: value,
          params,
          references,
          finalFrame,
          quote,
        });
      }
    } catch (error) {
      toast.error(errorMessage(error, active.mode === "chat" ? "Chat request failed" : "Atlas could not calculate this price"));
    } finally {
      setBusy(false);
    }
  };

  const confirmGeneration = async () => {
    const pending = pendingGeneration;
    if (!pending || busy || !apiKey) return;
    const job = createGenerationJob({
      sessionId: pending.sessionId,
      kind: pending.kind,
      model: pending.model,
      prompt: pending.prompt,
      params: pending.params,
      references: pending.references,
      finalFrame: pending.finalFrame,
      quote: pending.quote,
      status: "submitting",
    });
    commitStore((current) => {
      let next = addGenerationJob(current, job);
      next = updateSession(next, pending.sessionId, (session) => ({
        ...session,
        title: session.title === "Untitled session" ? titleFromPrompt(pending.prompt) : session.title,
      }));
      return next;
    });
    setPendingGeneration(undefined);
    setBusy(true);
    const request = {
      apiKey,
      model: pending.model,
      prompt: pending.prompt,
      params: pending.params,
      referenceUrls: pending.references.map((reference) => reference.url),
    };
    try {
      const response = pending.kind === "image"
        ? await imageMutation.mutateAsync(request)
        : await videoMutation.mutateAsync({ ...request, finalFrameUrl: pending.finalFrame?.url });
      if (!response.accepted) {
        commitStore((current) => updateGenerationJob(current, job.id, {
          status: "submission_uncertain",
          providerStatus: "submission_uncertain",
          error: response.error,
        }));
        toast.warning("Atlas did not confirm the submission. Check Atlas history before trying again.");
        return;
      }
      const status = normalizeGenerationStatus(response.status);
      const acceptedJob: GenerationJob = {
        ...job,
        requestId: response.id,
        model: response.model,
        status,
        providerStatus: response.status,
      };
      commitStore((current) => updateGenerationJob(current, job.id, {
        requestId: response.id,
        model: response.model,
        status,
        providerStatus: response.status,
        error: undefined,
      }));
      if (prompt.trim() === pending.prompt) setPrompt("");
      toast.success(`Atlas accepted the generation · ${response.id}`, { duration: 2500 });
      void pollJob(acceptedJob);
    } catch (error) {
      const message = errorMessage(error, "Atlas rejected the generation request");
      commitStore((current) => updateGenerationJob(current, job.id, {
        status: "failed",
        providerStatus: "rejected",
        error: message,
      }));
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const onMode = (mode: StudioMode) => updateActive((session) => {
    const model = defaultModelForMode(mode);
    return {
      ...session,
      mode,
      selectedModel: model.id,
      params: defaultParamsForModel(model.id),
    };
  });
  const onModel = (modelId: string) => updateActive((session) => {
    const model = getAtlasModel(modelId);
    if (!model || model.mode !== session.mode) return session;
    return { ...session, selectedModel: model.id, params: defaultParamsForModel(model.id) };
  });
  const onParam = (key: string, value: AtlasParameterValue) =>
    updateActive((session) => ({ ...session, params: { ...session.params, [key]: value } }));
  const onRename = (session: StudioSession) => {
    const title = window.prompt("Rename session", session.title);
    if (title?.trim()) commitStore((store) => renameSession(store, session.id, title));
  };
  const onDelete = (id: string) => {
    if (window.confirm("Delete this session from local history?")) {
      commitStore((store) => deleteSession(store, id));
    }
  };

  return <div className="app-shell flex min-h-screen text-[#f4f1eb]">
    <StudioSidebar
      open={sidebar}
      collapsed={sidebarCollapsed}
      connection={connection}
      mode={active.mode}
      activeSessionId={studio.activeSessionId}
      sessions={studio.sessions}
      onClose={() => setSidebar(false)}
      onToggleCollapsed={() => {
        setSidebarCollapsed((current) => {
          const next = !current;
          localStorage.setItem("atlas_sidebar_collapsed", next ? "1" : "0");
          return next;
        });
      }}
      onNew={() => { commitStore((store) => addSession(store, createSession())); setPrompt(""); }}
      onMode={(mode) => { onMode(mode); setSidebar(false); }}
      onOpen={(id) => { commitStore((store) => activateSession(store, id)); setPrompt(""); setSidebar(false); }}
      onRename={onRename}
      onDelete={onDelete}
      onSettings={() => { setKeyDraft(apiKey); setSettings(true); }}
    />
    <StudioWorkspace
      mode={active.mode}
      model={active.selectedModel}
      models={models}
      params={active.params}
      messages={active.messages}
      artifacts={active.artifacts}
      references={active.references}
      referenceLimit={referenceCapabilities.maxReferences}
      referencesOrdered={referenceCapabilities.ordered}
      referenceRolesSupported={referenceCapabilities.roles}
      finalFrame={active.finalFrame}
      finalFrameSupported={referenceCapabilities.finalFrame}
      prompt={prompt}
      busy={busy}
      uploading={uploading}
      uploadError={uploadError}
      jobs={activeJobs}
      connection={connection}
      pendingCount={recoverableJobs(studio).length}
      onPrompt={setPrompt}
      onSubmit={submit}
      onModel={onModel}
      onParam={onParam}
      onUploadReferences={uploadReferences}
      onRemoveReference={removeReference}
      onMoveReference={moveReference}
      onClearReferences={() => updateActive((session) => ({ ...session, references: [] }))}
      onUploadFinalFrame={uploadFinalFrame}
      onClearFinalFrame={() => updateActive((session) => ({ ...session, finalFrame: undefined }))}
      onUseArtifactReference={addArtifactReference}
      onUseArtifactFinalFrame={useArtifactAsFinalFrame}
      onClear={() => updateActive((session) => ({
        ...session,
        messages: [],
        artifacts: [],
        references: [],
        finalFrame: undefined,
      }))}
      onSidebar={() => setSidebar(true)}
      onSettings={() => { setKeyDraft(apiKey); setSettings(true); }}
      onCheckJob={(job) => { void pollJob(job); }}
    />
    <QuoteConfirmation
      open={Boolean(pendingGeneration)}
      quote={pendingGeneration?.quote}
      prompt={pendingGeneration?.prompt || ""}
      model={pendingGeneration?.model || ""}
      onCancel={() => setPendingGeneration(undefined)}
      onConfirm={() => { void confirmGeneration(); }}
    />
    <SettingsModal
      open={settings}
      value={keyDraft}
      onChange={setKeyDraft}
      onClose={() => setSettings(false)}
      onSave={saveKey}
      connection={connection}
    />
  </div>;
}

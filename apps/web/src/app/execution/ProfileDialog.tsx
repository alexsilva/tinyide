import * as Dialog from "@radix-ui/react-dialog";
import { Settings2, X } from "lucide-react";
import { WorkbenchIcon } from "../workbench/activity-components";
import { useEffect, useState } from "react";
import { formatCommandLineArguments, parseCommandLineArguments } from "@tinyide/core";
import type {
  ExecutionEnvironment,
  ExecutionProfile,
  ExecutionProfileExecutableOption,
  ExecutionProfilePresetContribution,
  ExecutionProfileTargetKindOption,
} from "@tinyide/plugin-api";
import {
  clearExecutionTarget,
  executionTargetKindForStep,
  executionTargetKindKey,
  GENERIC_EXECUTION_TARGET,
  materializeExecutionTarget,
  selectExecutionTargetKind,
  updateExecutionTargetValue,
} from "./profile-targets";

function makeProfile(): ExecutionProfile {
  const id = `profile-${crypto.randomUUID()}`;
  return {
    id,
    name: "Novo perfil",
    environment: { mode: "none" },
    saveBeforeRun: true,
    steps: [
      {
        id: "step-1",
        name: "Executar",
        executable: "",
        command: "",
        parameters: [],
        workingDirectory: "${workspaceRoot}",
      },
    ],
  };
}

function parseEnvironmentVariables(value: string): Readonly<Record<string, string>> {
  const variables: Record<string, string> = {};
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Variável de ambiente inválida: ${line}`);
    const name = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Nome de variável inválido: ${name}`);
    variables[name] = line.slice(separator + 1);
  }
  return variables;
}

function environmentVariablesText(value: Readonly<Record<string, string>> | undefined): string {
  return Object.entries(value ?? {}).map(([name, item]) => `${name}=${item}`).join("\n");
}

export function ProfileDialog({
  open,
  onOpenChange,
  profiles,
  selectedId,
  environments,
  executableOptions,
  presets,
  targetKinds,
  onBrowseCommand,
  onChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly profiles: readonly ExecutionProfile[];
  readonly selectedId: string | undefined;
  readonly environments: readonly ExecutionEnvironment[];
  readonly executableOptions: readonly ExecutionProfileExecutableOption[];
  readonly presets: readonly ExecutionProfilePresetContribution[];
  readonly targetKinds: readonly ExecutionProfileTargetKindOption[];
  readonly onBrowseCommand: () => Promise<string | undefined>;
  readonly onChange: (profiles: readonly ExecutionProfile[], selectedId?: string) => void;
}) {
  const [drafts, setDrafts] = useState<readonly ExecutionProfile[]>(profiles);
  const [editingId, setEditingId] = useState<string | undefined>(selectedId ?? profiles[0]?.id);
  const [removalId, setRemovalId] = useState<string>();
  const [parameterDrafts, setParameterDrafts] = useState<Readonly<Record<string, string>>>({});
  const [parameterError, setParameterError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setDrafts(profiles);
    setEditingId(selectedId ?? profiles[0]?.id);
    setRemovalId(undefined);
    setParameterDrafts(Object.fromEntries(profiles.map((profile) => [
      profile.id,
      formatCommandLineArguments(profile.steps[0]?.parameters ?? []),
    ])));
    setParameterError(undefined);
  }, [open, profiles, selectedId]);

  const editing = drafts.find((profile) => profile.id === editingId);
  const step = editing?.steps[0];
  const editingEnvironmentId = editing?.environment.mode === "fixed"
    ? editing.environment.environmentId
    : undefined;
  const compatibleTargetKinds = targetKinds.filter((targetKind) => (
    !targetKind.environmentProviderId
    || environments.find((environment) => environment.id === editingEnvironmentId)?.providerId
      === targetKind.environmentProviderId
  ));
  const selectedTargetKind = step
    ? executionTargetKindForStep(step, compatibleTargetKinds)
    : undefined;

  const updateEditing = (update: (profile: ExecutionProfile) => ExecutionProfile) => {
    if (!editingId) return;
    setDrafts((current) => current.map((profile) => (profile.id === editingId ? update(profile) : profile)));
  };

  const addProfile = () => {
    const profile = makeProfile();
    setDrafts((current) => [...current, profile]);
    setParameterDrafts((current) => ({ ...current, [profile.id]: "" }));
    setEditingId(profile.id);
  };

  const addPreset = (preset: ExecutionProfilePresetContribution) => {
    const template = preset.create({});
    const duplicates = drafts.filter((candidate) => candidate.id === template.id || candidate.id.startsWith(`${template.id}-`)).length;
    const id = duplicates ? `${template.id}-${duplicates + 1}` : template.id;
    const profile = {
      ...template,
      id,
      steps: template.steps.map((profileStep, index) => ({ ...profileStep, id: `${id}:step-${index + 1}` })),
    };
    setDrafts((current) => [...current, profile]);
    setParameterDrafts((current) => ({ ...current, [profile.id]: formatCommandLineArguments(profile.steps[0]?.parameters ?? []) }));
    setEditingId(profile.id);
  };

  const removeProfile = (id: string) => {
    const nextDrafts = drafts.filter((profile) => profile.id !== id);
    setDrafts(nextDrafts);
    setParameterDrafts((current) => Object.fromEntries(Object.entries(current).filter(([profileId]) => profileId !== id)));
    if (editingId === id) setEditingId(nextDrafts[0]?.id);
    setRemovalId(undefined);
  };

  const saveProfiles = () => {
    try {
      const parsedDrafts = drafts.map((profile) => {
        const rawParameters = parameterDrafts[profile.id]
          ?? formatCommandLineArguments(profile.steps[0]?.parameters ?? []);
        const parameters = rawParameters.trim() ? parseCommandLineArguments(rawParameters) : [];
        const targetKind = executionTargetKindForStep(profile.steps[0]!, targetKinds);
        return {
          ...profile,
          steps: profile.steps.map((profileStep, index) => index === 0
            ? targetKind
              ? materializeExecutionTarget(profileStep, targetKind, parameters)
              : { ...profileStep, parameters }
            : profileStep),
        };
      });
      setParameterError(undefined);
      onChange(parsedDrafts, editing?.id);
      onOpenChange(false);
    } catch (cause) {
      setParameterError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const removalProfile = drafts.find((profile) => profile.id === removalId);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content profile-dialog">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">EXECUÇÃO</span>
              <Dialog.Title>Perfis de execução</Dialog.Title>
              <Dialog.Description>Configure comandos reutilizáveis sem acoplar linguagem ao core.</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Fechar">
                <X size={17} />
              </button>
            </Dialog.Close>
          </div>

          <div className="profile-layout">
            <aside className="profile-list-panel">
              <div className="section-title-row">
                <strong>Perfis</strong>
                <span>{drafts.length}</span>
              </div>
              <div className="profile-list">
                {drafts.map((profile) => (
                  <article
                    key={profile.id}
                    className={`profile-card${editingId === profile.id ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="profile-card__select"
                      onClick={() => setEditingId(profile.id)}
                    >
                      <WorkbenchIcon icon="terminal" size={16} />
                      <span>
                        <strong>{profile.name}</strong>
                        <small>{profile.steps.length} etapa(s)</small>
                      </span>
                    </button>
                    <button
                      className="card-delete"
                      type="button"
                      aria-label={`Remover ${profile.name}`}
                      title={`Remover ${profile.name}`}
                      onClick={() => setRemovalId(profile.id)}
                    >
                      <X size={14} />
                    </button>
                  </article>
                ))}
              </div>
              <button className="button secondary full" type="button" onClick={addProfile}>
                <WorkbenchIcon icon="plus" size={15} /> Novo perfil
              </button>
              {presets.length ? (
                <select className="profile-preset-select" aria-label="Adicionar perfil a partir de um preset" defaultValue="" onChange={(event) => {
                  const preset = presets.find((candidate) => candidate.id === event.target.value);
                  if (preset) addPreset(preset);
                  event.currentTarget.value = "";
                }}>
                  <option value="" disabled>Adicionar preset</option>
                  {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                </select>
              ) : null}
            </aside>

            <div className="profile-editor">
              {editing && step ? (
                <>
                  <div className="form-grid two-columns">
                    <label>
                      Nome do perfil
                      <input
                        value={editing.name}
                        placeholder="Ex.: Servidor de desenvolvimento"
                        onChange={(event) => updateEditing((profile) => ({ ...profile, name: event.target.value }))}
                      />
                    </label>
                    <label>
                      Ambiente
                      <select
                        value={editing.environment.mode === "fixed" ? editing.environment.environmentId : ""}
                        onChange={(event) => updateEditing((profile) => ({
                          ...profile,
                          environment: event.target.value
                            ? { mode: "fixed", environmentId: event.target.value }
                            : { mode: "none" },
                          steps: profile.steps.map((item, index) => index === 0
                            ? {
                                ...item,
                                executable: event.target.value ? "${environmentExecutable}" : item.executable,
                              }
                            : item),
                        }))}
                      >
                        <option value="">Nenhum ambiente</option>
                        {environments.map((environment) => (
                          <option key={environment.id} value={environment.id}>
                            {environment.name}{environment.version ? ` — ${environment.version}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <section className="form-section">
                    <div className="form-section-heading">
                      <WorkbenchIcon icon="terminal" size={17} />
                      <div>
                        <strong>Comando</strong>
                        <small>Primeira etapa do perfil.</small>
                      </div>
                    </div>
                    <label>
                      Executável
                      <input
                        value={editingEnvironmentId
                          ? environments.find((environment) => environment.id === editingEnvironmentId)?.executable ?? ""
                          : step.executable}
                        placeholder="Ex.: node, python, bash ou caminho completo"
                        readOnly={Boolean(editingEnvironmentId)}
                        onChange={(event) => updateEditing((profile) => ({
                          ...profile,
                          steps: profile.steps.map((item, index) => index === 0 ? { ...item, executable: event.target.value } : item),
                        }))}
                      />
                    </label>
                    {editing.environment.mode === "none" && executableOptions.filter((option) => !option.environmentId).length ? (
                      <div className="profile-executable-options">
                        {executableOptions.filter((option) => !option.environmentId).map((option) => (
                          <button
                            className="button secondary compact"
                            type="button"
                            key={option.id}
                            onClick={() => updateEditing((profile) => ({
                              ...profile,
                              steps: profile.steps.map((item, index) => index === 0
                                ? { ...item, executable: option.value }
                                : item),
                            }))}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <label>
                      Comando
                      <div className="profile-target-row">
                        <select
                          className="profile-target-kind-select"
                          aria-label="Tipo de alvo"
                          title={selectedTargetKind?.description ?? "Comando genérico"}
                          value={selectedTargetKind ? executionTargetKindKey(selectedTargetKind) : GENERIC_EXECUTION_TARGET}
                          onChange={(event) => {
                            const targetKind = compatibleTargetKinds.find((candidate) => (
                              executionTargetKindKey(candidate) === event.target.value
                            ));
                            updateEditing((profile) => ({
                              ...profile,
                              steps: profile.steps.map((item, index) => index === 0
                                ? targetKind
                                  ? selectExecutionTargetKind(item, targetKind)
                                  : clearExecutionTarget(item)
                                : item),
                            }));
                          }}
                        >
                          <option value={GENERIC_EXECUTION_TARGET}>Genérico</option>
                          {compatibleTargetKinds.map((targetKind) => (
                            <option key={executionTargetKindKey(targetKind)} value={executionTargetKindKey(targetKind)}>
                              {targetKind.label}
                            </option>
                          ))}
                        </select>
                        {selectedTargetKind ? (
                          <input
                            value={step.target?.value ?? ""}
                            placeholder={selectedTargetKind.placeholder}
                            onChange={(event) => updateEditing((profile) => ({
                              ...profile,
                              steps: profile.steps.map((item, index) => index === 0
                                ? updateExecutionTargetValue(item, selectedTargetKind, event.target.value)
                                : item),
                            }))}
                          />
                        ) : (
                          <input
                            value={step.command}
                            placeholder="Ex.: caminho/do/arquivo ou subcomando"
                            onChange={(event) => updateEditing((profile) => ({
                              ...profile,
                              steps: profile.steps.map((item, index) => index === 0 ? { ...item, command: event.target.value } : item),
                            }))}
                          />
                        )}
                        {selectedTargetKind?.browse || !selectedTargetKind ? (
                            <button className="button secondary compact" type="button" onClick={() => {
                              void onBrowseCommand().then((path) => {
                                if (!path) return;
                                updateEditing((profile) => ({
                                  ...profile,
                                  steps: profile.steps.map((item, index) => index === 0
                                    ? selectedTargetKind
                                      ? updateExecutionTargetValue(item, selectedTargetKind, path)
                                      : { ...item, command: path }
                                    : item),
                                }));
                              });
                            }}>Procurar</button>
                        ) : null}
                      </div>
                    </label>
                    <label>
                      Parâmetros
                      <textarea
                        rows={5}
                        value={parameterDrafts[editing.id] ?? formatCommandLineArguments(step.parameters)}
                        placeholder={step.parametersPlaceholder ?? "Ex.: --port 8000 --verbose"}
                        onChange={(event) => {
                          setParameterDrafts((current) => ({ ...current, [editing.id]: event.target.value }));
                          setParameterError(undefined);
                        }}
                      />
                      {parameterError ? <small className="field-error">{parameterError}</small> : null}
                    </label>
                    <label>
                      Diretório de trabalho
                      <input
                        value={step.workingDirectory ?? ""}
                        placeholder="Ex.: ${workspaceRoot} ou caminho absoluto"
                        onChange={(event) => updateEditing((profile) => ({
                          ...profile,
                          steps: profile.steps.map((item, index) => index === 0
                            ? { ...item, workingDirectory: event.target.value }
                            : item),
                        }))}
                      />
                    </label>
                    <label>
                      Variáveis de ambiente
                      <textarea
                        rows={4}
                        value={environmentVariablesText(step.environmentVariables)}
                        placeholder="Ex.: DEBUG=1"
                        onChange={(event) => {
                          try {
                            const environmentVariables = parseEnvironmentVariables(event.target.value);
                            updateEditing((profile) => ({
                              ...profile,
                              steps: profile.steps.map((item, index) => index === 0
                                ? { ...item, environmentVariables }
                                : item),
                            }));
                          } catch {
                            // Preserve the last valid value while the user is still typing.
                          }
                        }}
                      />
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={step.continueOnError === true}
                        onChange={(event) => updateEditing((profile) => ({
                          ...profile,
                          steps: profile.steps.map((item, index) => index === 0
                            ? { ...item, continueOnError: event.target.checked }
                            : item),
                        }))}
                      />
                      Continuar após falha
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={editing.saveBeforeRun !== false}
                        onChange={(event) => updateEditing((profile) => ({ ...profile, saveBeforeRun: event.target.checked }))}
                      />
                      Salvar antes de executar
                    </label>
                  </section>
                </>
              ) : (
                <div className="empty-panel">
                  <Settings2 size={28} />
                  <strong>Selecione ou crie um perfil</strong>
                </div>
              )}
            </div>
          </div>
          <div className="profile-dialog__footer">
            <Dialog.Close asChild>
              <button className="button secondary" type="button">Cancelar</button>
            </Dialog.Close>
            <button className="button primary" type="button" onClick={saveProfiles}>
              <WorkbenchIcon icon="save" size={15} /> Salvar alterações
            </button>
          </div>
          {removalProfile ? (
            <div className="profile-removal-backdrop" role="presentation">
              <section className="profile-removal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="profile-removal-title">
                <div>
                  <span className="eyebrow">CONFIRMAÇÃO</span>
                  <h3 id="profile-removal-title">Remover perfil?</h3>
                  <p>O perfil <strong>{removalProfile.name}</strong> será removido quando as alterações forem salvas.</p>
                </div>
                <div className="dialog-actions">
                  <button className="button secondary" type="button" onClick={() => setRemovalId(undefined)}>Cancelar</button>
                  <button className="button danger" type="button" onClick={() => removeProfile(removalProfile.id)}>Remover</button>
                </div>
              </section>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowUpCircle,
  CheckCircle2,
  CircleAlert,
  Package,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { WorkbenchIcon } from "../workbench/activity-components";
import { useCallback, useEffect, useState } from "react";
import type {
  ExecutionEnvironment,
  ExecutionEnvironmentPackageInventory,
  ExecutionEnvironmentProvider,
} from "@tinyide/plugin-api";

export function EnvironmentPackageManager({
  environment,
  provider,
  onClose,
  onEnvironmentChanged,
}: {
  readonly environment: ExecutionEnvironment;
  readonly provider: ExecutionEnvironmentProvider;
  readonly onClose: () => void;
  readonly onEnvironmentChanged: () => Promise<void>;
}) {
  const [inventory, setInventory] = useState<ExecutionEnvironmentPackageInventory>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "updates">("all");
  const [packageSpecs, setPackageSpecs] = useState("");
  const [busy, setBusy] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [operationOutput, setOperationOutput] = useState("");
  const [packageToRemove, setPackageToRemove] = useState<string>();
  const [packageError, setPackageError] = useState<string>();

  const loadPackages = useCallback(async () => {
    if (!provider.listPackages) return;
    setBusy("refresh");
    setPackageError(undefined);
    try {
      setInventory(await provider.listPackages(environment.id));
    } catch (cause) {
      setPackageError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }, [environment.id, provider]);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  const execute = async (
    label: string,
    operation: () => Promise<{ readonly inventory: ExecutionEnvironmentPackageInventory; readonly output?: string }>,
  ) => {
    setBusy(label);
    setPackageError(undefined);
    setFeedback(`${label}...`);
    try {
      const result = await operation();
      setInventory(result.inventory);
      setOperationOutput(result.output ?? "");
      setFeedback(`${label} concluído.`);
      await onEnvironmentChanged();
      return true;
    } catch (cause) {
      setPackageError(cause instanceof Error ? cause.message : String(cause));
      setFeedback(undefined);
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const installedPackages = inventory?.packages ?? [];
  const visiblePackages = installedPackages.filter((item) => {
    if (filter === "updates" && !item.latestVersion) return false;
    return !query.trim() || item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  const updates = installedPackages.filter((item) => item.latestVersion);
  const packageManagementAvailable = Boolean(
    provider.listPackages && provider.installPackages && provider.upgradePackages && provider.uninstallPackages,
  );

  return (
    <section className="package-manager" aria-label={`Pacotes de ${environment.name}`}>
      <header className="package-manager__header">
        <button className="icon-button small" type="button" aria-label="Voltar para ambientes" title="Voltar para ambientes" onClick={onClose}><WorkbenchIcon icon="back" size={15} /></button>
        <div><strong>{environment.name}</strong><span>{environment.version ?? "Python"} · Pacotes</span></div>
        <button className="icon-button small" type="button" aria-label="Atualizar pacotes" title="Atualizar pacotes" disabled={Boolean(busy)} onClick={() => void loadPackages()}><WorkbenchIcon icon="refresh" size={14} {...(busy === "refresh" ? { className: "is-spinning" } : {})} /></button>
      </header>

      <div className="package-manager__summary">
        <span><PackageCheck size={14} /><strong>{installedPackages.length}</strong> instalados</span>
        <span className={updates.length ? "has-updates" : ""}><ArrowUpCircle size={14} /><strong>{updates.length}</strong> atualizações</span>
        <span className={inventory?.health === "issues" ? "has-issues" : ""}>{inventory?.health === "healthy" ? <WorkbenchIcon icon="check" size={14} /> : <WorkbenchIcon icon="problems" size={14} />}{inventory?.health === "healthy" ? "Saudável" : inventory?.health === "issues" ? "Conflitos" : "Verificando"}</span>
      </div>

      {packageManagementAvailable ? (
        <form
          className="package-install"
          onSubmit={(event) => {
            event.preventDefault();
            const packages = packageSpecs.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
            if (!packages.length || !provider.installPackages) return;
            void execute("Instalação", () => provider.installPackages!(environment.id, packages))
              .then((succeeded) => { if (succeeded) setPackageSpecs(""); });
          }}
        >
          <label htmlFor="package-specs">Instalar pacotes</label>
          <div>
            <input id="package-specs" value={packageSpecs} onChange={(event) => setPackageSpecs(event.target.value)} placeholder="requests ou django==5.2" />
            <button className="button primary compact" type="submit" disabled={Boolean(busy) || !packageSpecs.trim()}><WorkbenchIcon icon="plus" size={14} /> Instalar</button>
          </div>
          <small>Aceita vários nomes ou versões, separados por espaço.</small>
        </form>
      ) : <p className="package-manager__unsupported">Este provedor não oferece gerenciamento detalhado de pacotes.</p>}

      <div className="package-manager__controls">
        <div className="segmented-control" aria-label="Filtrar pacotes">
          <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}><WorkbenchIcon icon="package" size={13} /> Todos</button>
          <button type="button" className={filter === "updates" ? "is-active" : ""} onClick={() => setFilter("updates")}><ArrowUpCircle size={13} /> Atualizações</button>
        </div>
        <label className="package-search"><WorkbenchIcon icon="search" size={13} /><input aria-label="Buscar pacote instalado" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar" /></label>
      </div>

      {updates.length && provider.upgradePackages ? (
        <button className="package-update-all" type="button" disabled={Boolean(busy)} onClick={() => void execute("Atualização", () => provider.upgradePackages!(environment.id))}><ArrowUpCircle size={14} /> Atualizar todos ({updates.length})</button>
      ) : null}

      {packageError ? <div className="package-feedback is-error" role="alert"><WorkbenchIcon icon="problems" size={14} /><span>{packageError}</span><button type="button" onClick={() => void loadPackages()}><WorkbenchIcon icon="refresh" size={13} /> Tentar novamente</button></div> : null}
      {feedback ? <div className="package-feedback" role="status">{busy ? <WorkbenchIcon icon="refresh" size={14} className="is-spinning" /> : <WorkbenchIcon icon="check" size={14} />}<span>{feedback}</span></div> : null}
      {inventory?.issues?.length ? <details className="package-issues"><summary><WorkbenchIcon icon="problems" size={13} /> Ver conflitos ({inventory.issues.length})</summary>{inventory.issues.map((issue) => <code key={issue}>{issue}</code>)}</details> : null}
      {operationOutput ? <details className="package-output"><summary><WorkbenchIcon icon="terminal" size={13} /> Saída da última operação</summary><pre>{operationOutput}</pre></details> : null}

      <div className="package-list" aria-busy={busy === "refresh"}>
        {busy === "refresh" && !inventory ? <div className="package-empty"><WorkbenchIcon icon="refresh" size={20} className="is-spinning" /><span>Carregando pacotes...</span></div> : null}
        {inventory && !visiblePackages.length ? <div className="package-empty"><WorkbenchIcon icon="package" size={20} /><span>{query ? "Nenhum pacote corresponde à busca." : filter === "updates" ? "Todos os pacotes estão atualizados." : "Nenhum pacote instalado."}</span></div> : null}
        {visiblePackages.map((item) => (
          <article className="package-row" key={item.name}>
            <div><strong>{item.name}</strong><span>{item.version}{item.latestVersion ? ` → ${item.latestVersion}` : ""}</span></div>
            <div>
              {item.latestVersion && provider.upgradePackages ? <button className="icon-button small" type="button" aria-label={`Atualizar ${item.name}`} title={`Atualizar ${item.name}`} disabled={Boolean(busy)} onClick={() => void execute(`Atualização de ${item.name}`, () => provider.upgradePackages!(environment.id, [item.name]))}><ArrowUpCircle size={14} /></button> : null}
              {provider.uninstallPackages ? <button className="icon-button small danger" type="button" aria-label={`Desinstalar ${item.name}`} title={`Desinstalar ${item.name}`} disabled={Boolean(busy)} onClick={() => setPackageToRemove(item.name)}><Trash2 size={14} /></button> : null}
            </div>
          </article>
        ))}
      </div>

      <Dialog.Root open={Boolean(packageToRemove)} onOpenChange={(open) => { if (!open) setPackageToRemove(undefined); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-content--small package-remove-dialog">
            <Dialog.Title>Desinstalar pacote</Dialog.Title>
            <Dialog.Description>Remover <strong>{packageToRemove}</strong> de {environment.name}? Dependências usadas por outros pacotes não serão removidas automaticamente.</Dialog.Description>
            <div className="dialog-actions">
              <button className="button secondary compact" type="button" onClick={() => setPackageToRemove(undefined)}><X size={14} /> Cancelar</button>
              <button className="button danger compact" type="button" onClick={() => {
                const name = packageToRemove;
                setPackageToRemove(undefined);
                if (name && provider.uninstallPackages) void execute(`Remoção de ${name}`, () => provider.uninstallPackages!(environment.id, [name]));
              }}><Trash2 size={14} /> Desinstalar</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}


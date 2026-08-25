import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export interface AboutDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly version: string;
}

export function AboutDialog({ open, onOpenChange, version }: AboutDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content--small">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>Sobre</Dialog.Title>
              <Dialog.Description>Editor web extensível orientado a plugins.</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button>
            </Dialog.Close>
          </div>
          <div className="about-content">
            <img className="about-logo" src="/icon.png" alt="Ícone do tinyIde" />
            <span>Versão {version}</span>
            <p>O núcleo permanece um editor de texto básico. Recursos de IDE são fornecidos por plugins independentes.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

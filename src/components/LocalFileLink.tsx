import type { ReactNode } from "react";
import { Check, Download, LoaderCircle, RotateCcw } from "lucide-react";

import { t } from "@/lib/i18n";
import { FilePreviewButton } from "./FilePreviewButton";
import {
  MessageFolderFiles,
  OutsideWorkspaceFile,
  saveFailureText,
  useLocalFileSave,
  type MessageAttachmentContext,
} from "./AttachmentPreview";

const fileName = (path: string) => path.split(/[\\/]/).at(-1) ?? path;

export function LocalFileLink({ filePath, name, children, message }: {
  filePath: string;
  name?: string;
  children?: ReactNode;
  message?: MessageAttachmentContext;
}) {
  const save = useLocalFileSave(filePath, name, message);
  if (!message) {
    return <span title="Unavailable legacy file reference" className="break-words text-ink-secondary">{children}</span>;
  }
  const label = save.state === "saving"
    ? "Saving…"
    : save.state === "saved"
      ? "Saved"
      : save.state === "failed"
        ? "Retry"
        : null;

  return (
    <span dir="ltr" className="inline-flex flex-wrap items-center gap-x-1.5 [unicode-bidi:isolate]">
      <FilePreviewButton
        path={filePath}
        name={name ?? fileName(filePath)}
        message={message}
        showIcon={false}
        className="inline-flex items-center gap-1 break-words text-start text-accent underline decoration-accent/40 hover:decoration-accent"
      >
        {children}
      </FilePreviewButton>
      <button
        type="button"
        onClick={() => void save.save()}
        disabled={save.state === "saving"}
        title="Save a copy"
        aria-label={t("attach.saveAria", { name: name ?? fileName(filePath) })}
        className="inline-flex items-center gap-1 break-words text-start text-accent underline decoration-accent/40 hover:decoration-accent disabled:cursor-wait"
      >
        {save.state === "saving" ? (
          <LoaderCircle size={12} className="shrink-0 animate-spin" aria-hidden="true" />
        ) : save.state === "saved" ? (
          <Check size={12} className="shrink-0 text-success" aria-hidden="true" />
        ) : save.state === "failed" ? (
          !save.outsideWorkspace && <RotateCcw size={12} className="shrink-0" aria-hidden="true" />
        ) : (
          <Download size={12} className="shrink-0" aria-hidden="true" />
        )}
      </button>
      {label && (
        <span
          role={save.state === "failed" ? "alert" : "status"}
          title={save.state === "saved" ? save.savedTo : undefined}
          className={`text-[12px] ${save.state === "saved" ? "text-success" : save.state === "failed" ? "text-danger" : "text-ink-secondary"}`}
        >
          {save.state === "failed" ? saveFailureText(save) : label}
        </span>
      )}
      {save.state === "failed" && save.outsideWorkspace && (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 text-[12px]">
          <OutsideWorkspaceFile filePath={filePath} />
        </span>
      )}
      {save.folder && <MessageFolderFiles folderPath={filePath} listing={save.folder} message={message} />}
    </span>
  );
}

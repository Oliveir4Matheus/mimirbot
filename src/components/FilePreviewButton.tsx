import { useRef, useState, type ReactNode } from "react";
import { Download, Eye } from "lucide-react";

import { previewFormat } from "@/lib/file-preview";
import { t } from "@/lib/i18n";
import type { MessageAttachmentContext } from "./AttachmentPreview";
import { useLocalFileSave } from "./AttachmentPreview";
import { FilePreviewDialog } from "./FilePreviewDialog";

export function FilePreviewButton({
  path,
  name,
  message,
  children,
  className = "table-action",
  title,
  showIcon = true,
}: {
  path: string;
  name: string;
  message: MessageAttachmentContext;
  children?: ReactNode;
  className?: string;
  title?: string;
  showIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const save = useLocalFileSave(path, name, message);
  const supported = Boolean(previewFormat(name) ?? previewFormat(path));
  const label = title ?? t(supported ? "preview.open" : "attach.saveAria", { name });
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        title={label}
        aria-label={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (supported) setOpen(true);
          else void save.save();
        }}
      >
        {children ?? (supported ? <Eye size={14} /> : <Download size={14} />)}
        {children && showIcon && (supported ? <Eye size={12} className="shrink-0" /> : null)}
      </button>
      {open && supported && (
        <FilePreviewDialog
          path={path}
          name={name}
          message={message}
          onClose={() => setOpen(false)}
          returnFocus={trigger.current}
        />
      )}
    </>
  );
}

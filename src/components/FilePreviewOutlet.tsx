import { closeFilePreview, setFilePreviewPosition, useFilePreview } from "@/lib/file-preview-store";
import { FilePreviewDialog } from "./FilePreviewDialog";

export function FilePreviewOutlet() {
  const { request, position } = useFilePreview();
  if (!request) return null;
  return (
    <FilePreviewDialog
      path={request.path}
      name={request.name}
      message={request.message}
      position={position}
      onPositionChange={setFilePreviewPosition}
      onClose={closeFilePreview}
      returnFocus={request.returnFocus}
    />
  );
}

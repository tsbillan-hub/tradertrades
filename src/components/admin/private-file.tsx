import { FileText } from "lucide-react";

/** A private upload (an ID photo or proof of use) that only its owner and staff can open. */
export function PrivateFile({ file }: { file: { id: string; mimeType: string; originalName: string } | null | undefined }) {
  if (!file) return <p className="text-sm text-muted">The file is gone.</p>;
  const href = `/api/media/${file.id}`;
  if (file.mimeType.startsWith("image/")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-lg border border-line bg-sunk" title="Open full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={file.originalName} className="max-h-72 max-w-full object-contain" />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm w-fit">
      <FileText /> Open {file.originalName}
    </a>
  );
}

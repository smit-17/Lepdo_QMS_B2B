import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadImages } from "@/lib/api.functions";
import type { QuotationImage } from "@/lib/types";

export function ImageUploader({
  images,
  onChange,
}: {
  images: QuotationImage[];
  onChange: (next: QuotationImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("images", file));
      const uploaded = await uploadImages({ data: form });
      onChange([...images, ...uploaded]);
      toast.success(`${uploaded.length} image${uploaded.length > 1 ? "s" : ""} uploaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <ImagePlus className="mr-2 size-4" />
        )}
        Upload images
      </Button>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((image) => (
            <div
              key={image.path}
              className="group relative size-20 overflow-hidden rounded-lg border border-border bg-muted sm:size-24"
            >
              <button
                type="button"
                onClick={() => setPreview(image.url)}
                className="block size-full"
              >
                <img
                  src={image.url}
                  alt="Quotation item"
                  loading="lazy"
                  suppressHydrationWarning
                  className="size-full object-cover"
                />
              </button>
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => onChange(images.filter((i) => i.path !== image.path))}
                className="absolute top-1 right-1 rounded-full bg-destructive p-1 text-white opacity-90"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          <img
            src={preview}
            alt="Quotation item preview"
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}
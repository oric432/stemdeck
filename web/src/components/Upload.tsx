import { useRef, useState } from "react";
import { Loader2, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/state/libraryStore";

export function Upload() {
  const isUploading = useLibraryStore((state) => state.isUploading);
  const upload = useLibraryStore((state) => state.upload);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      upload(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => setIsDraggingOver(false);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      upload(file);
    }
  };

  return (
    <Card
      className={cn(
        "mx-auto w-full max-w-lg border-2 border-dashed transition-colors",
        isDraggingOver ? "border-primary bg-accent/40" : "border-border",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Button
          size="lg"
          className="gap-2 text-base font-medium tracking-wide uppercase"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? <Loader2 className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
          Upload a song
        </Button>
        <p className="text-sm text-muted-foreground">or drop an audio file here</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          // sr-only, not `hidden` — Firefox won't open the picker via
          // .click() on a display:none input, only Chrome tolerates that.
          className="sr-only"
          onChange={handleFileChange}
        />
      </CardContent>
    </Card>
  );
}

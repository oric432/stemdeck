import { Upload } from "@/components/Upload";
import { SongList } from "@/components/SongList";

export function Library() {
  return (
    <div className="flex w-full flex-col gap-6">
      <Upload />
      <SongList />
    </div>
  );
}

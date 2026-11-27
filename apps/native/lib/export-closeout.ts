import { File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { Platform } from "react-native";

export async function exportCloseout(filename: string, csv: string) {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return;
  }

  if (!(await isAvailableAsync())) {
    throw new Error("No se pueden compartir archivos en este dispositivo");
  }

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(csv);
  await shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text" });
}

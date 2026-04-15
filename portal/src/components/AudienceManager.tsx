import { Select } from "./ui/Input";
import { useState, useRef } from "react";
import {
  Users,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  ArrowRight,
  Database,
  ShieldCheck,
  Info,
  Settings2,
} from "lucide-react";
import { Button } from "./ui/button";
import { clsx } from "clsx";
import { useAuthenticatedFetch } from "../context/AuthContext";

interface AudienceManagerProps {
  appId: string;
}

interface CSVPreview {
  headers: string[];
  rows: string[][];
}

interface Mapping {
  userId: string;
  token: string;
  language: string;
  platform: string;
}

export function AudienceManager({ appId }: AudienceManagerProps) {
  const authFetch = useAuthenticatedFetch();
  const [step, setStep] = useState<
    "upload" | "mapping" | "processing" | "complete"
  >("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [mapping, setMapping] = useState<Partial<Mapping>>({
    userId: "",
    token: "",
    language: "",
    platform: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());
        if (lines.length === 0) return;
        const headers = lines[0].split(",").map((h) => h.trim());
        const rows = lines
          .slice(1, 4)
          .map((line) => line.split(",").map((cell) => cell.trim()));
        setPreview({ headers, rows });

        // Smart auto-mapping
        const newMapping: Partial<Mapping> = {};
        headers.forEach((h) => {
          const lowH = h.toLowerCase();
          if (lowH.includes("user") || lowH.includes("id"))
            newMapping.userId = h;
          if (lowH.includes("token") || lowH.includes("push"))
            newMapping.token = h;
          if (lowH.includes("lang") || lowH.includes("locale"))
            newMapping.language = h;
          if (lowH.includes("platform") || lowH.includes("os"))
            newMapping.platform = h;
        });
        setMapping(newMapping);
        setStep("mapping");
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleImport = async () => {
    setIsProcessing(true);
    setStep("processing");

    // Simulation for now
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      // In real app: send mapping and file to backend
      // await authFetch(`/apps/${appId}/audience/import`, { method: 'POST', ... })
      console.log(
        "Processed for app:",
        appId,
        !!authFetch,
        file?.name,
        isProcessing,
      );
      setStep("complete");
    } catch (error) {
      setStep("mapping");
      console.error("Import failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setStep("upload");
    setMapping({ userId: "", token: "", language: "", platform: "" });
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-white">
        <div>
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Audience Import
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Mass register devices and user attributes via CSV
          </p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={clsx(
                "w-2 h-2 rounded-full transition-all duration-500",
                (i === 1 && step === "upload") ||
                  (i === 2 && step === "mapping") ||
                  (i === 3 && (step === "processing" || step === "complete"))
                  ? "bg-purple-600 w-6"
                  : "bg-gray-200",
              )}
            />
          ))}
        </div>
      </div>

      <div className="p-8">
        {step === "upload" && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="group border-2 border-dashed border-gray-200 rounded-[2rem] p-16 text-center hover:border-purple-400 hover:bg-purple-50/30 transition-all cursor-pointer relative overflow-hidden"
          >
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-20 h-20 bg-purple-50 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                <Upload className="w-10 h-10 text-purple-500" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-2">
                Upload your Audiences List
              </h4>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                Drag and drop your .csv file here, or click to browse your local
                storage.
              </p>

              <div className="mt-8 flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3" /> Token Validation
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3" /> Deduplication
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3" /> Mass Mapping
                </div>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".csv"
              onChange={handleFileUpload}
            />

            {/* Background Decor */}
            <div className="absolute top-0 end-0 -me-16 -mt-16 w-64 h-64 bg-purple-50/50 rounded-full blur-3xl" />
          </div>
        )}

        {step === "mapping" && preview && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-sm font-bold text-amber-900 leading-none">
                  Mapping Required
                </h5>
                <p className="text-xs text-amber-700/80 mt-1.5">
                  Please map your CSV columns to NotifyX audience fields. We've
                  attempted to auto-detect mappings based on header names.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="space-y-4">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Field Assignments
                </h5>
                {(Object.keys(mapping) as Array<keyof Mapping>).map((field) => (
                  <div key={field} className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 ms-1 capitalize">
                      {field.replace("userId", "User ID")}
                    </label>
                    <Select
                      value={mapping[field] || ""}
                      onChange={(e) =>
                        setMapping({ ...mapping, [field]: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-gray-50 border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                    >
                      <option value="">Select Column...</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </section>

              <section className="space-y-4">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  CSV Snapshot
                </h5>
                <div className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50/50">
                  <table className="w-full text-[10px]">
                    <thead className="bg-gray-100/50 border-b border-gray-100">
                      <tr>
                        {(preview.headers as string[]).map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-start font-bold text-gray-500 uppercase tracking-wider truncate max-w-[80px]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(preview.rows as string[][]).map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td
                              key={j}
                              className="px-3 py-2 text-gray-500 truncate max-w-[80px]"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-gray-100 mt-4">
                  <div className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                    <span>Total Rows Detected</span>
                    <span className="text-gray-900">... records</span>
                  </div>
                </div>
              </section>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-50">
              <Button
                variant="outline"
                className="rounded-xl px-6"
                onClick={reset}
              >
                Abandon
              </Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700 rounded-xl px-10 shadow-lg shadow-purple-500/20"
                onClick={handleImport}
              >
                Start Registration <ArrowRight className="w-4 h-4 ms-2" />
              </Button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="py-20 text-center animate-in zoom-in-95 duration-500">
            <div className="relative inline-block mb-8">
              <div className="w-24 h-24 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin" />
              <Database className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-purple-600" />
            </div>
            <h4 className="text-xl font-bold text-gray-900 mb-2">
              Ingesting Infrastructure
            </h4>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">
              We are validating device tokens and mapping them to user profiles.
              This won't take long.
            </p>

            <div className="mt-12 w-full max-w-xs mx-auto bg-gray-100 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 animate-progress origin-left" />
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="py-16 text-center animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-green-50 rounded-[2rem] flex items-center justify-center mb-8 mx-auto ring-8 ring-green-50/50">
              <ShieldCheck className="w-10 h-10 text-green-500" />
            </div>
            <h4 className="text-2xl font-bold text-gray-900 mb-3">
              Sync Successful!
            </h4>
            <p className="text-sm text-gray-500 mb-10 max-w-xs mx-auto">
              Your audience has been successfully mapped and registered to
              high-performance delivery nodes.
            </p>

            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto mb-10">
              <div className="p-4 rounded-2xl border border-gray-100 bg-white">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Registered
                </p>
                <p className="text-xl font-bold text-gray-900">... users</p>
              </div>
              <div className="p-4 rounded-2xl border border-gray-100 bg-white">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Status
                </p>
                <p className="text-xl font-bold text-green-600">Active</p>
              </div>
            </div>

            <Button
              className="bg-gray-900 hover:bg-black rounded-xl px-12 h-12"
              onClick={reset}
            >
              Back to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

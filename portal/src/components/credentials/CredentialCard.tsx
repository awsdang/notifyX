import { CheckCircle, Clock, Pencil, Trash2, Power, Eye } from "lucide-react";
import { Button } from "../ui/button";
import { clsx } from "clsx";
import { ProviderIcon, PROVIDER_INFO, type ProviderKey } from "./ProviderIcon";
import type { Credential } from "../../services/credentialService";

interface CredentialCardProps {
  credential: Credential;
  onActivateVersion: (credentialVersionId: string) => void;
  onOpenTest: (credentialVersionId: string) => void;
  onEdit: (provider: string) => void;
  onDeactivate: (credentialId: string) => void;
  onDelete: (credentialId: string) => void;
  onOpenWebSdkView: (provider: string) => void;
}

export function CredentialCard({
  credential,
  onActivateVersion,
  onOpenTest,
  onEdit,
  onDeactivate,
  onDelete,
  onOpenWebSdkView,
}: CredentialCardProps) {
  const info = PROVIDER_INFO[credential.provider as ProviderKey];
  if (!info) return null;

  const hasActiveVersion = !!credential.activeVersion;

  return (
    <div
      className={clsx(
        "rounded-3xl border border-slate-200/80 bg-linear-to-br from-white to-slate-50/60 p-6 flex flex-col gap-5 shadow-sm hover:shadow-lg transition-all relative overflow-hidden",
        !hasActiveVersion && "from-slate-50 to-slate-100/70",
      )}
    >
      <div className="absolute -top-10 -end-10 w-28 h-28 rounded-full bg-blue-100/30 blur-2xl" />
      <div className="flex items-center gap-4">
        <ProviderIcon provider={credential.provider} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-slate-900 text-[1.05rem]">
              {info.name}
            </h4>
            {hasActiveVersion ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            )}
          </div>
          <p className="text-xs text-slate-400 font-semibold mt-1 truncate uppercase tracking-widest">
            {hasActiveVersion
              ? `Active v${credential.activeVersion!.version} • ${new Date(credential.activeVersion!.createdAt).toLocaleDateString()}`
              : "No active version"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-white/80 border border-slate-200 rounded-xl p-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg w-8 h-8 hover:bg-blue-50"
            onClick={() => onOpenWebSdkView(credential.provider)}
            title="View Web SDK credentials"
          >
            <Eye className="w-4 h-4 text-indigo-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg w-8 h-8 hover:bg-blue-50"
            onClick={() => onEdit(credential.provider)}
            title="Edit provider (creates a new version)"
          >
            <Pencil className="w-4 h-4 text-blue-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg w-8 h-8 hover:bg-amber-50"
            onClick={() => onDeactivate(credential.id)}
            title="Deactivate provider"
          >
            <Power className="w-4 h-4 text-amber-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg w-8 h-8 hover:bg-red-50"
            onClick={() => onDelete(credential.id)}
            title="Delete provider"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </Button>
          {/* {hasActiveVersion && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-lg w-8 h-8 hover:bg-indigo-50"
              onClick={() => onOpenTest(credential.activeVersion!.id)}
              title="Test active version"
            >
              <TestTube className="w-4 h-4 text-indigo-600" />
            </Button>
          )} */}
        </div>
      </div>

      {/* Version history */}
      {credential.versions.length > 0 && (
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Versions ({credential.versions.length})
          </p>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pe-1">
            {credential.versions.map((v) => (
              <div
                key={v.id}
                className={clsx(
                  "flex items-center justify-between text-xs px-3 py-2.5 rounded-xl border",
                  v.isActive
                    ? "bg-emerald-50 border-emerald-100"
                    : "bg-white border-slate-200",
                )}
              >
                <div className="flex items-center gap-2">
                  {v.isActive ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-slate-300" />
                  )}
                  <span
                    className={clsx(
                      "font-semibold",
                      v.isActive ? "text-emerald-700" : "text-slate-700",
                    )}
                  >
                    v{v.version}
                  </span>
                  <span className="text-slate-400">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {!v.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-blue-600 hover:bg-blue-50 rounded-md"
                      onClick={() => onActivateVersion(v.id)}
                    >
                      Activate
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] rounded-md"
                    onClick={() => onOpenTest(v.id)}
                  >
                    Test
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-sm font-semibold text-slate-700">
          {hasActiveVersion ? "Active" : "Inactive"}
        </span>
        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">
          Encrypted at rest
        </span>
      </div>
    </div>
  );
}

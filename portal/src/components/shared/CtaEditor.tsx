import { Select } from "../ui/Input";
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  CTA_TYPE_OPTIONS,
  type CtaType,
  DEFAULT_CTA_TYPE,
  getCtaValuePlaceholder,
  ctaNeedsValue,
} from "../../constants/cta";

export interface CtaData {
  ctaType: CtaType;
  ctaLabel: string;
  ctaValue: string;
  ctaTypeSecondary: CtaType;
  ctaLabelSecondary: string;
  ctaValueSecondary: string;
}

export const EMPTY_CTA_DATA: CtaData = {
  ctaType: DEFAULT_CTA_TYPE,
  ctaLabel: "",
  ctaValue: "",
  ctaTypeSecondary: "none",
  ctaLabelSecondary: "",
  ctaValueSecondary: "",
};

interface CtaEditorProps {
  data: CtaData;
  onChange: (data: CtaData) => void;
  inputClass?: string;
}

export function CtaEditor({ data, onChange, inputClass = "" }: CtaEditorProps) {
  const [showSecondary, setShowSecondary] = useState(
    data.ctaTypeSecondary !== "none",
  );

  const defaultInput =
    inputClass ||
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  const update = (fields: Partial<CtaData>) => {
    onChange({ ...data, ...fields });
  };

  return (
    <div className="space-y-3">
      {/* Primary CTA */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Default Action
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold">
              Action Type
            </label>
            <Select
              className={defaultInput}
              value={data.ctaType}
              onChange={(e) =>
                update({ ctaType: e.target.value as CtaType })
              }
            >
              {CTA_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          {ctaNeedsValue(data.ctaType) && (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Label
                </label>
                <input
                  type="text"
                  className={defaultInput}
                  value={data.ctaLabel}
                  onChange={(e) => update({ ctaLabel: e.target.value })}
                  placeholder={
                    data.ctaType === "deep_link" ? "Open screen" : "Open link"
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  {data.ctaType === "deep_link" ? "Deep Link URI" : "URL"}
                </label>
                <input
                  type={data.ctaType === "open_url" ? "url" : "text"}
                  className={defaultInput}
                  value={data.ctaValue}
                  onChange={(e) => update({ ctaValue: e.target.value })}
                  placeholder={getCtaValuePlaceholder(data.ctaType)}
                />
              </div>
            </>
          )}
        </div>
        {data.ctaType === "open_app" && (
          <p className="mt-2 text-xs text-slate-500">
            Tapping the notification will open your app to its default screen.
          </p>
        )}
        {data.ctaType === "dismiss" && (
          <p className="mt-2 text-xs text-slate-500">
            Tapping the notification will dismiss it without opening the app.
          </p>
        )}
      </div>

      {/* Secondary CTA */}
      {showSecondary ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              Secondary Action (optional)
            </p>
            <button
              type="button"
              onClick={() => {
                setShowSecondary(false);
                update({
                  ctaTypeSecondary: "none",
                  ctaLabelSecondary: "",
                  ctaValueSecondary: "",
                });
              }}
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-semibold">
                Action Type
              </label>
              <Select
                className={defaultInput}
                value={data.ctaTypeSecondary}
                onChange={(e) =>
                  update({
                    ctaTypeSecondary: e.target.value as CtaType,
                  })
                }
              >
                {CTA_TYPE_OPTIONS.map((opt) => (
                  <option key={`s-${opt.value}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            {ctaNeedsValue(data.ctaTypeSecondary) && (
              <>
                <div>
                  <label className="mb-2 block text-xs font-semibold">
                    Label
                  </label>
                  <input
                    type="text"
                    className={defaultInput}
                    value={data.ctaLabelSecondary}
                    onChange={(e) =>
                      update({ ctaLabelSecondary: e.target.value })
                    }
                    placeholder="Learn more"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold">
                    {data.ctaTypeSecondary === "deep_link"
                      ? "Deep Link URI"
                      : "URL"}
                  </label>
                  <input
                    type={
                      data.ctaTypeSecondary === "open_url" ? "url" : "text"
                    }
                    className={defaultInput}
                    value={data.ctaValueSecondary}
                    onChange={(e) =>
                      update({ ctaValueSecondary: e.target.value })
                    }
                    placeholder={getCtaValuePlaceholder(
                      data.ctaTypeSecondary,
                    )}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowSecondary(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add secondary action
        </button>
      )}
    </div>
  );
}

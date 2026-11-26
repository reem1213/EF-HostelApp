import { Field, Input } from "@/components/ui/input";
import { OTA_OPTIONS } from "@/lib/domain/profile";

export type ProfileDefaults = {
  otas: string[];
  website: string | null;
  socials: Partial<Record<"instagram" | "facebook" | "tiktok" | "youtube" | "google_business", string>>;
  postalAddress: string;
  replyToEmail: string;
};

const SOCIALS = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourhostel" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourhostel" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourhostel" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourhostel" },
  { key: "google_business", label: "Google Business Profile", placeholder: "https://g.page/yourhostel" },
] as const;

/**
 * OTAs, website and social links, plus the postal address and reply-to email that
 * marketing emails need. `values` is the echoed submission after a validation error
 * and takes precedence over `defaults`.
 */
export function ProfileFields({ defaults, values, errors }: { defaults?: ProfileDefaults; values?: Record<string, string>; errors?: Record<string, string> }) {
  const chosen = new Set(values?.otas !== undefined ? values.otas.split(",").filter(Boolean) : (defaults?.otas ?? []));
  const text = (name: string, fallback: string | null | undefined) => values?.[name] ?? fallback ?? "";

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="text-[13px] font-medium">Which booking sites do you use?</legend>
        <p className="mt-0.5 text-[12px] text-muted">We compare your price on each one against the others.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {OTA_OPTIONS.map((o) => (
            <label key={o.id} className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-[14px]">
              <input type="checkbox" name="otas" value={o.id} defaultChecked={chosen.has(o.id)} className="size-4 accent-teal" />
              {o.name}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Your website" name="website" error={errors?.website} help="We read it to check how well it shows up in Google.">
        <Input id="website" name="website" inputMode="url" autoComplete="url" placeholder="https://yourhostel.com" defaultValue={text("website", defaults?.website)} />
      </Field>

      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-medium">Social media</p>
        {SOCIALS.map((s) => (
          <Field key={s.key} label={s.label} name={`social_${s.key}`} error={errors?.[`social_${s.key}`]}>
            <Input id={`social_${s.key}`} name={`social_${s.key}`} inputMode="url" placeholder={s.placeholder} defaultValue={text(`social_${s.key}`, defaults?.socials[s.key])} />
          </Field>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-medium">For emails to your guests</p>
        <Field label="Postal address" name="postalAddress" error={errors?.postalAddress} help="Required on every marketing email.">
          <Input id="postalAddress" name="postalAddress" autoComplete="street-address" defaultValue={text("postalAddress", defaults?.postalAddress)} />
        </Field>
        <Field label="Reply-to email" name="replyToEmail" error={errors?.replyToEmail} help="Guests who reply reach this address.">
          <Input id="replyToEmail" name="replyToEmail" type="email" autoComplete="email" defaultValue={text("replyToEmail", defaults?.replyToEmail)} />
        </Field>
      </div>
    </div>
  );
}

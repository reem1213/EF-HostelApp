import { Field, Input } from "@/components/ui/input";
import { COST_FIELDS } from "@/lib/forms";

/**
 * The five monthly cost fields behind "cost per bed". Used in onboarding and in
 * Costs, so both forms feed the same calculation. `defaults` are in cents.
 */
export function CostFields({
  errors,
  defaults,
  values,
}: {
  errors?: Record<string, string>;
  /** Echoed submission after a validation error. Takes precedence over defaults. */
  values?: Record<string, string>;
  defaults?: Partial<Record<(typeof COST_FIELDS)[number]["name"], number>>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {COST_FIELDS.map((f) => {
        const cents = defaults?.[f.name];
        return (
          <Field key={f.name} label={f.label} name={`cost-${f.name}`} error={errors?.[f.name]} help={f.help}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
              <Input
                id={`cost-${f.name}`}
                name={f.name}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                defaultValue={values?.[f.name] ?? (cents ? (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2) : "")}
                className="pl-7"
              />
            </div>
          </Field>
        );
      })}
    </div>
  );
}

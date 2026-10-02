import { useQueryClient } from "@tanstack/react-query";
import {
  getListEmployeesQueryKey,
  useInviteEmployee,
  useListEmployees,
} from "@workspace/api-client-react";
import { UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";

const statusLabels = {
  active: "Actief",
  invited: "Uitgenodigd",
  unlinked: "Niet gekoppeld",
};

export function InvitationPanel() {
  const queryClient = useQueryClient();
  const employees = useListEmployees();
  const invitation = useInviteEmployee();
  const [form, setForm] = useState({
    email: "",
    name: "",
    department: "",
    employeeId: "",
  });
  const availableProfiles = (employees.data ?? []).filter(
    (employee) => employee.accountStatus === "unlinked" && !employee.isAdmin,
  );
  const selectedProfile = availableProfiles.find(
    (employee) => employee.id === Number(form.employeeId),
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    invitation.mutate(
      {
        data: {
          email: form.email.trim(),
          name: selectedProfile?.name ?? form.name.trim(),
          department: selectedProfile?.department ?? form.department.trim(),
          ...(selectedProfile ? { employeeId: selectedProfile.id } : {}),
        },
      },
      {
        onSuccess: () => {
          setForm({ email: "", name: "", department: "", employeeId: "" });
          void queryClient.invalidateQueries({
            queryKey: getListEmployeesQueryKey(),
          });
        },
      },
    );
  };

  return (
    <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <UserRound className="mt-0.5 h-5 w-5 text-[hsl(168_31%_43%)]" />
        <div>
          <h2 className="font-semibold">Medewerkers uitnodigen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nieuwe accounts krijgen alleen toegang na een uitnodiging.
          </p>
        </div>
      </div>

      <form className="mt-5 space-y-3" onSubmit={submit}>
        <label className="block text-xs font-semibold">
          Bestaand profiel koppelen
          <select
            data-testid="select-invite-employee"
            value={form.employeeId}
            onChange={(event) => {
              const id = event.target.value;
              const employee = availableProfiles.find(
                (item) => item.id === Number(id),
              );
              setForm({
                ...form,
                employeeId: id,
                name: employee?.name ?? "",
                department: employee?.department ?? "",
              });
            }}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          >
            <option value="">Nieuw medewerkersprofiel aanmaken</option>
            {availableProfiles.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} · {employee.department}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold">
          E-mailadres
          <input
            data-testid="input-invite-email"
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
            placeholder="medewerker@bedrijf.nl"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            Naam
            <input
              data-testid="input-invite-name"
              required
              disabled={!!selectedProfile}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-60"
            />
          </label>
          <label className="block text-xs font-semibold">
            Afdeling
            <input
              data-testid="input-invite-department"
              required
              disabled={!!selectedProfile}
              value={form.department}
              onChange={(event) =>
                setForm({ ...form, department: event.target.value })
              }
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-60"
            />
          </label>
        </div>
        <button
          data-testid="button-invite-employee"
          disabled={invitation.isPending || employees.isLoading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {invitation.isPending ? "Uitnodiging versturen…" : "Uitnodiging versturen"}
        </button>
        {invitation.isSuccess && (
          <p role="status" className="text-sm text-[hsl(168_31%_33%)]">
            Uitnodiging verstuurd. Het profiel wordt actief zodra de medewerker de uitnodiging accepteert.
          </p>
        )}
        {invitation.isError && (
          <p role="alert" className="text-sm text-[hsl(2_61%_49%)]">
            De uitnodiging is niet verstuurd. Controleer het e-mailadres en probeer het opnieuw.
          </p>
        )}
        {employees.isError && (
          <p role="alert" className="text-sm text-[hsl(2_61%_49%)]">
            Medewerkersprofielen konden niet worden geladen.
          </p>
        )}
      </form>

      <div className="mt-6 border-t border-border/70 pt-5">
        <h3 className="text-sm font-semibold">Teamaccounts</h3>
        {employees.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Profielen laden…</p>
        ) : (employees.data ?? []).filter((employee) => !employee.isAdmin).length ===
          0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Er zijn nog geen medewerkersprofielen.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border/60">
            {(employees.data ?? [])
              .filter((employee) => !employee.isAdmin)
              .map((employee) => (
                <div
                  key={employee.id}
                  data-testid={`row-account-${employee.id}`}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {employee.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {employee.email ?? employee.department}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                    {statusLabels[employee.accountStatus]}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
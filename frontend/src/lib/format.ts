export function poyshaToTaka(poysha: number): string {
  return `Tk ${(poysha / 100).toFixed(2)}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRole(role: string): string {
  return role === "DRIVER" ? "Driver" : "Passenger";
}
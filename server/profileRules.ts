export const PLATFORM_MIN_AGE = 18;
export const MARKETPLACE_MIN_AGE = 18;

export function calculateAge(dateOfBirth: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return Number.NaN;
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  if (Number.isNaN(birth.getTime()) || birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return Number.NaN;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function assertMinimumAge(dateOfBirth: string | null | undefined, minimum: number, message: string, now = new Date()) {
  const age = dateOfBirth ? calculateAge(dateOfBirth, now) : Number.NaN;
  if (!Number.isFinite(age) || age < minimum) throw new Error(message);
}

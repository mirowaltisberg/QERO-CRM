/**
 * Generate personalized German greeting based on gender
 * 
 * Rules:
 * - male → "Sehr geehrter Herr <Nachname>,"
 * - female → "Sehr geehrte Frau <Nachname>,"
 * - unknown/null gender → fallback to company/team greeting
 */

export interface GreetingPerson {
  first_name?: string | null;
  last_name: string;
  gender?: "male" | "female" | string | null;
}

/**
 * Generate a formal German greeting for emails
 * 
 * @param person - Contact person with last_name and optional gender
 * @param companyName - Company name for fallback greeting
 * @returns Formatted greeting string with comma
 */
export function generateEmailGreeting(
  person: GreetingPerson | null | undefined,
  companyName: string | null | undefined
): string {
  // Male contact person
  if (person?.last_name && person.gender === "male") {
    return `Sehr geehrter Herr ${person.last_name},`;
  }
  
  // Female contact person
  if (person?.last_name && person.gender === "female") {
    return `Sehr geehrte Frau ${person.last_name},`;
  }
  
  // Fallback: company/team greeting for unknown gender or no person
  if (companyName) {
    return `Sehr geehrtes ${companyName} Team,`;
  }
  
  return "Sehr geehrtes Team,";
}

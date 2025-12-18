/**
 * Client-side encoding fix
 * Fixes display issues where UTF-8 is mis-interpreted as Latin-1
 */

/**
 * Fix a string that's been incorrectly displayed (UTF-8 bytes shown as Latin-1)
 * Example: "Zürich" stored correctly in DB as UTF-8, but browser shows "ZÃ¼rich"
 * 
 * This happens when:
 * - Database stores: `c3bc` (correct UTF-8 for 'ü')
 * - Browser interprets as Latin-1: shows 'Ã¼' instead of 'ü'
 */
export function fixClientDisplayEncoding(str: string | null | undefined): string | null {
  if (!str) return null;
  
  // If the string looks like it has mojibake, it means UTF-8 bytes
  // are being interpreted as Latin-1. We need to:
  // 1. Convert string to Latin-1 bytes
  // 2. Re-interpret those bytes as UTF-8
  
  try {
    // Check if string contains mojibake markers
    if (!/[Ã][^\s]/.test(str) && !/[Â][^\s]/.test(str) && !/â€/.test(str)) {
      return str; // No mojibake, return as-is
    }
    
    // Convert the mis-displayed string back to bytes
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8');
    
    // The string contains UTF-8 bytes that were interpreted as Latin-1
    // We need to reverse this: get the actual byte values
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      bytes.push(str.charCodeAt(i) & 0xFF);
    }
    
    // Now interpret these bytes as UTF-8
    const fixed = decoder.decode(new Uint8Array(bytes));
    
    return fixed;
  } catch (e) {
    console.error('[Client Encoding] Failed to fix:', str, e);
    return str;
  }
}

/**
 * Fix encoding in a contact object
 */
export function fixContactDisplay(contact: any): any {
  if (!contact) return contact;
  
  return {
    ...contact,
    company_name: fixClientDisplayEncoding(contact.company_name) || contact.company_name,
    contact_name: fixClientDisplayEncoding(contact.contact_name) || contact.contact_name,
    street: fixClientDisplayEncoding(contact.street) || contact.street,
    city: fixClientDisplayEncoding(contact.city) || contact.city,
    email: fixClientDisplayEncoding(contact.email) || contact.email,
    notes: fixClientDisplayEncoding(contact.notes) || contact.notes,
  };
}

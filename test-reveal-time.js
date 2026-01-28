// Test with wrapping quotes
const testValue = '"2026-01-28T16:30:00+07:00"'; // From database

console.log('=== TESTING QUOTE REMOVAL ===');
console.log('Input:', testValue);

// Method 1: regex replace
const cleaned = testValue.replace(/^"(.*)"$/, '$1');
console.log('After regex:', cleaned);

// Test date parsing
const now = new Date();
const reveal = new Date(cleaned);

console.log('\nCurrent:', now.toISOString());
console.log('Reveal:', reveal.toISOString());
console.log('now >= reveal:', now >= reveal);
console.log('Hours until reveal:', (reveal - now) / 1000 / 60 / 60);

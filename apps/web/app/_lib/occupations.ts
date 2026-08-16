// Curated, general-purpose occupation list for the Account modal's profile form. Deliberately
// broad rather than career-specific (includes Student/Homemaker/Retired alongside job titles).
// "Other" is NOT included here — it's rendered as an always-appended final <option> by the
// component, so "is this a custom value" is a simple `!OCCUPATIONS.includes(value)` check.
export const OCCUPATIONS = [
  "Software Engineer / Developer",
  "Designer",
  "Product Manager",
  "Data Scientist / Analyst",
  "Marketing",
  "Sales",
  "Business / Finance",
  "Healthcare / Medical",
  "Education / Teaching",
  "Legal",
  "Engineering (Non-Software)",
  "Writer / Editor",
  "Artist / Creative",
  "Student",
  "Entrepreneur / Founder",
  "Consultant",
  "Customer Support",
  "Human Resources",
  "Operations",
  "Homemaker",
  "Retired",
  "Unemployed",
] as const;

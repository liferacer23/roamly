export function csvCell(value: unknown) {
  const text = String(value ?? 'unavailable');
  const numeric = /^-?\d+(\.\d+)?$/.test(text);
  return (
    '"' + (!numeric && /^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"'
  );
}

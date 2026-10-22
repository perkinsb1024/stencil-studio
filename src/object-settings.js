// Missing properties inherit the current document defaults.
export function objectSettings(options, contourId) {
  return { ...options, ...options.objectSettings?.[contourId] };
}

/** Join truthy class names into a single string. */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default cn

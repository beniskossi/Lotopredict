export function getNumberColor(num: number): string {
  if (num >= 1 && num <= 9) return "bg-white text-black border-2 border-gray-300"
  if (num >= 10 && num <= 19) return "bg-blue-900 text-white"
  if (num >= 20 && num <= 29) return "bg-green-900 text-white"
  if (num >= 30 && num <= 39) return "bg-indigo-700 text-white"
  if (num >= 40 && num <= 49) return "bg-yellow-700 text-white"
  if (num >= 50 && num <= 59) return "bg-pink-600 text-white"
  if (num >= 60 && num <= 69) return "bg-orange-600 text-white"
  if (num >= 70 && num <= 79) return "bg-gray-600 text-white"
  if (num >= 80 && num <= 90) return "bg-red-700 text-white"
  return "bg-gray-400 text-white"
}

export function getNumberColorClass(num: number): string {
  return getNumberColor(num)
}

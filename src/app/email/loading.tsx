export default function EmailLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        <p className="text-sm text-gray-500">Loading emails...</p>
      </div>
    </div>
  );
}


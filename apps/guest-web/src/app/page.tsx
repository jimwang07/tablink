export default function Home() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-white mb-4">Tablink</h1>
        <p className="text-gray-300 mb-6">
          The easiest way to split bills with friends.
        </p>
        <p className="text-gray-400 text-sm">
          If you received a link to claim items on a receipt,
          please use the full URL provided to you.
        </p>
      </div>
    </div>
  );
}

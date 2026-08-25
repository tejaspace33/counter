return (
  <div className="min-h-screen bg-gradient-to-br from-violet-100 via-white to-pink-100 flex items-center justify-center p-4 sm:p-6">

    {currentUser ? (
      <Chat onLogout={handleLogout} />
    ) : (
      <div className="w-full max-w-md lg:max-w-lg bg-white rounded-3xl shadow-2xl border border-violet-100 overflow-hidden">

        {/* your login/join UI */}

      </div>
    )}

  </div>
);
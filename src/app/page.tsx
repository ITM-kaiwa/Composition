import SentenceBattleGame from "@/components/SentenceBattleGame";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 pt-6 text-center sm:px-8">
        <h1 className="text-lg font-bold text-sand-700">呪文バトル</h1>
        <p className="mt-1 text-xs text-sand-500">
          「みんなの日本語」の文をならびかえて呪文をとなえ、モンスターをたおそう
        </p>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <SentenceBattleGame />
      </main>

      <footer className="px-4 py-6 text-center text-xs text-sand-500">
        文データ出典: 「みんなの日本語 初級I・II 本冊」（第1課〜第50課）
      </footer>
    </div>
  );
}

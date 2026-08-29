/**
 * UI-chrome translations for the 呪文バトル game (Japanese / Vietnamese).
 * The actual sentence content the player assembles is always Japanese --
 * only the surrounding game UI (labels, buttons, battle-log messages)
 * switches. Toggled from the gear-icon settings panel.
 */

export type Lang = "ja" | "vi";

export const LANG_STORAGE_KEY = "jumon-battle-lang";

interface Strings {
  lessonSelectLabel: string;
  randomOption: string;
  vol1Group: string;
  vol2Group: string;
  downloadButton: string;
  noDataMessage: string;
  noLessonDataMessage: string;
  roundLabel: (round: number, total: number) => string;
  bossSuffix: string;
  scatterLog: string;
  successLog: (sentence: string) => string;
  failLog: (sentence: string) => string;
  castButton: string;
  redoButton: string;
  allPlacedMessage: string;
  successLabel: string;
  failLabel: string;
  nextButton: string;
  victoryTitle: string;
  victorySubtitle: string;
  defeatTitle: string;
  defeatSubtitle: string;
  fightAgainButton: string;
  settingsButtonLabel: string;
  settingsTitle: string;
  languageLabel: string;
  closeButton: string;
  lessonLabel: (n: number) => string;
}

export const STRINGS: Record<Lang, Strings> = {
  ja: {
    lessonSelectLabel: "課をえらぶ:",
    randomOption: "ランダム（全課）",
    vol1Group: "Vol.1 (N5) 第1課〜25課",
    vol2Group: "Vol.2 (N4) 第26課〜50課",
    downloadButton: "文リストをダウンロード (CSV)",
    noDataMessage: "文データがまだありません。",
    noLessonDataMessage: "この課の文が見つかりません。",
    roundLabel: (round, total) => `ラウンド ${round}/${total}`,
    bossSuffix: "（ラスボス）",
    scatterLog: "じゅもんの　ことばが　ちらばった！　ならびかえて　じゅもんを　となえよう！",
    successLog: (s) => `せいこう！「${s}」　てきに　ダメージを　あたえた！`,
    failLog: (s) => `しっぱい…　じゅもんが　みだれた。ただしい　文は「${s}」でした。`,
    castButton: "✨ 呪文をとなえる！",
    redoButton: "やりなおす",
    allPlacedMessage: "（ぜんぶ　ならべた）",
    successLabel: "せいかい！",
    failLabel: "ざんねん…",
    nextButton: "つぎの じゅもんへ →",
    victoryTitle: "てきを　たおした！　しょうり！",
    victorySubtitle: "文法の呪文でモンスターをたおしました！",
    defeatTitle: "やられてしまった…",
    defeatSubtitle: "れんしゅうして、また ちょうせんしよう！",
    fightAgainButton: "もういちど たたかう",
    settingsButtonLabel: "せってい",
    settingsTitle: "せってい",
    languageLabel: "ひょうじげんご",
    closeButton: "とじる",
    lessonLabel: (n) => `第${n}課`,
  },
  vi: {
    lessonSelectLabel: "Chọn bài học:",
    randomOption: "Ngẫu nhiên (tất cả các bài)",
    vol1Group: "Tập 1 (N5) Bài 1〜25",
    vol2Group: "Tập 2 (N4) Bài 26〜50",
    downloadButton: "Tải danh sách câu (CSV)",
    noDataMessage: "Chưa có dữ liệu câu.",
    noLessonDataMessage: "Không tìm thấy câu nào cho bài này.",
    roundLabel: (round, total) => `Vòng ${round}/${total}`,
    bossSuffix: "（Trùm cuối）",
    scatterLog: "Các từ của câu thần chú đã bị xáo trộn! Hãy sắp xếp lại để đọc thần chú!",
    successLog: (s) => `Thành công! "${s}" — gây sát thương lên quái vật!`,
    failLog: (s) => `Thất bại... câu thần chú bị rối. Câu đúng là "${s}".`,
    castButton: "✨ Đọc thần chú!",
    redoButton: "Làm lại",
    allPlacedMessage: "（Đã xếp hết）",
    successLabel: "Chính xác!",
    failLabel: "Rất tiếc…",
    nextButton: "Câu thần chú tiếp theo →",
    victoryTitle: "Đã đánh bại quái vật! Chiến thắng!",
    victorySubtitle: "Bạn đã đánh bại quái vật bằng phép thuật ngữ pháp!",
    defeatTitle: "Bạn đã bị đánh bại…",
    defeatSubtitle: "Hãy luyện tập thêm rồi thử thách lại nhé!",
    fightAgainButton: "Chiến đấu lại",
    settingsButtonLabel: "Cài đặt",
    settingsTitle: "Cài đặt",
    languageLabel: "Ngôn ngữ hiển thị",
    closeButton: "Đóng",
    lessonLabel: (n) => `Bài ${n}`,
  },
};

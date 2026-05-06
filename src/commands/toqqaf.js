module.exports = {
  config: {
    name: "توقف",
    aliases: [],
    description: "يوقف الإرسال التلقائي الذي بدأ بأمر انسخ",
    usage: "توقف",
    adminOnly: false,
    ownerOnly: false,
    category: "general",
  },

  async run({ api, threadID }) {
    if (!global._autoSendActive || !global._autoSendActive.has(threadID)) {
      return api.sendMessage(
        "⚠️ لا يوجد إرسال تلقائي نشط في هذه المحادثة.",
        threadID
      );
    }

    const state = global._autoSendActive.get(threadID);
    if (state && typeof state._cancelTimer === "function") {
      state._cancelTimer();
    }
    global._autoSendActive.delete(threadID);

    api.sendMessage("🛑 تم إيقاف الإرسال التلقائي.", threadID);
  },
};

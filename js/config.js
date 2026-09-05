'use strict';
/*
 * Только подтверждённые публичные ссылки владельца проекта.
 * null — осознанный режим без выдуманных контактов: медиа ведут
 * к материалам страницы, заявка передаётся своему пригласившему.
 * Прямой контакт должен иметь вид https://t.me/имя_пользователя
 * (фактическое имя пользователя записывается латиницей).
 */
window.KASTA_CONFIG = Object.freeze({
  applicationTelegram: null,
  channels: Object.freeze({
    podcast: null,
    youtube: null,
    telegram: null
  })
});

# Personal wake-up voices and buddies

RiseQuest can prepare a personal message in one of twelve curated stock voices
when an eligible adult saves an alarm. Choose a default voice and one to three
readings before the alarm tone. Voice preparation costs 10 RisePoints for a new
message or voice; an unchanged save and playback reuse the saved audio.

The backend uses Async TTS Flash. Set `ASYNC_API_KEY` privately on your own server
to enable it. Never put the key in the mobile client. Message text is sent only
after the in-app consent choice; profile, health and location context are not
included. Children and other ineligible profiles retain device speech.

Android caches the audio privately and plays it through its native alarm service,
including while the app is backgrounded. Android full-screen alarm permission
allows a private wake-up surface over the lock screen. Personal app controls
remain behind normal device unlocking. iOS notification speech and tone together
must fit within the platform's short notification-sound limit; Focus/silent
settings still apply on the supported notification path.

A Wake Buddy can now be chosen or added within the alarm form. Contacts remain
on the device. At wake-up, an explicit action opens the selected number in the
phone dialer; the app does not automatically call or send a message.

[Updated product demo](https://youtu.be/Ngkwk4RFOh0)

For judging, use synthetic messages and a consenting test contact. Do not place
real calls or make purchases. Provider generation consumes configured credits.

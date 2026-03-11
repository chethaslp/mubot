/**
 * Meeting Macro — Google Apps Script
 *
 * doGet params:
 *   emails   (repeatable) — attendee email addresses, e.g. emails=a@b.com&emails=c@d.com
 *   name     — meeting title (optional, defaults to "µLearn Team Meet")
 *   dt       — ISO 8601 start datetime (optional, defaults to now)
 *   d        — duration in hours (optional, defaults to 1)
 */
function doGet(request) {
  var emails   = request.parameters.emails   || [];
  var name     = (request.parameters.name    || [''])[0];
  var dtParam  = (request.parameters.dt      || [''])[0];
  var durParam = (request.parameters.d       || [''])[0];

  if (!emails || emails.length === 0) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: true, message: 'No emails provided.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!name || name === '') name = 'µLearn Team Meet';

  var dt = (dtParam && dtParam !== '') ? new Date(dtParam) : new Date();
  var duration = (durParam && durParam !== '') ? parseInt(durParam) : 1;
  var end = new Date(dt.getTime() + duration * 60 * 60 * 1000);

  var attendees = emails
    .map(function(e) { return e.trim(); })
    .filter(function(e) { return e.length > 0; })
    .map(function(e) { return { email: e }; });

  var resource = {
    summary: name,
    description: 'µLearn UCEK',
    start:  { dateTime: dt.toISOString(),  timeZone: 'Asia/Kolkata' },
    end:    { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
    guestsCanModify: true,
    attendees: attendees,
    conferenceData: {
      createRequest: {
        conferenceSolutionKey: { type: 'hangoutsMeet' },
        requestId: 'mulearn-meet-' + dt.getTime()
      }
    }
  };

  var event = Calendar.Events.insert(resource, 'primary', {
    sendNotifications: true,
    conferenceDataVersion: 1
  });

  return ContentService
    .createTextOutput(JSON.stringify({
      id:    event.id,
      link:  event.hangoutLink,
      title: name,
      dt:    dt.toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * doPost — delete a calendar event by ID
 * Body: { "eventId": "..." }
 */
function doPost(request) {
  var body = JSON.parse(request.postData.contents || '{}');
  var eventId = body.eventId;

  if (!eventId) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: true, message: 'eventId required.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  Calendar.Events.remove('primary', eventId, { sendNotifications: true });

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

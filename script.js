
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.year').forEach(el => el.textContent = new Date().getFullYear());
  const form = document.querySelector('#contact-form');
  if (form) form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const recipient = 'nutrivance3@gmail.com';
    if (recipient.includes('YOUR-EMAIL')) {
      document.querySelector('#form-status').textContent = 'Replace nutrivance3@gmail.com in contact.html and script.js with your real business email before launch.';
      return;
    }
    const subject = encodeURIComponent('NutriVance website enquiry: ' + data.get('topic'));
    const body = encodeURIComponent('Name: ' + data.get('name') + '\nEmail: ' + data.get('email') + '\nTopic: ' + data.get('topic') + '\n\nMessage:\n' + data.get('message'));
    window.location.href = 'mailto:' + recipient + '?subject=' + subject + '&body=' + body;
  });
});

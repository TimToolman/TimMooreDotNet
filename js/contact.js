document.addEventListener('DOMContentLoaded', () => {
    initRevealEmail();
    initContactForm();
});

function initRevealEmail() {
    const btn = document.getElementById('reveal-email');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const reversed = btn.dataset.email || '';
        const email = reversed.split('').reverse().join('');
        if (!email) return;

        const link = document.createElement('a');
        link.href = `mailto:${email}`;
        link.className = 'revealed-email';
        link.textContent = email;
        btn.parentNode.replaceChild(link, btn);
    });
}

function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const status = document.getElementById('form-status');
    const sendBtn = document.getElementById('send-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (form.querySelector('[name="botcheck"]').checked) return;

        status.textContent = '';
        status.className = 'form-status';
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        const data = Object.fromEntries(new FormData(form).entries());
        if (!data.subject) data.subject = 'New message from timmoore.net';

        try {
            const res = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (result.success) {
                status.textContent = "Thanks — message sent. I'll be in touch.";
                status.classList.add('form-status-success');
                form.reset();
            } else {
                status.textContent = result.message || 'Something went wrong. Please try again or use the email button.';
                status.classList.add('form-status-error');
            }
        } catch (err) {
            status.textContent = 'Network error. Please try again or use the email button.';
            status.classList.add('form-status-error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send message';
        }
    });
}

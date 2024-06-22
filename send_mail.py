import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# Email configuration
smtp_server = 'localhost'
smtp_port = 25
from_addr = 'info@advacor.org'
to_addr = 'alfred.shaffir@gmail.com'
subject = 'Test Email'
body = 'This is a test email sent from a Python script.'

# Create the email message
msg = MIMEMultipart()
msg['From'] = from_addr
msg['To'] = to_addr
msg['Subject'] = subject

# Attach the body with the msg instance
msg.attach(MIMEText(body, 'plain'))

# Create SMTP session for sending the mail
try:
    server = smtplib.SMTP(smtp_server, smtp_port)
    server.sendmail(from_addr, to_addr, msg.as_string())
    server.quit()
    print('Email sent successfully')
except Exception as e:
    print(f'Failed to send email: {e}')


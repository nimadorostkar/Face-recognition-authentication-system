"""
SMS notification module using Kavenegar.

Sends login notification SMS to users after successful face authentication.
Uses Kavenegar's verify_lookup API with a pre-defined template.

Configuration via environment variables:
  KAVENEGAR_API_KEY  - Your Kavenegar API key
  KAVENEGAR_TEMPLATE - Template name configured in your Kavenegar panel
  SMS_ENABLED        - Set to "true" to enable SMS sending (default: false)
"""

import os
import logging

logger = logging.getLogger(__name__)

KAVENEGAR_API_KEY = os.getenv("KAVENEGAR_API_KEY", "")
KAVENEGAR_TEMPLATE = os.getenv("KAVENEGAR_TEMPLATE", "face-login")
SMS_ENABLED = os.getenv("SMS_ENABLED", "false").lower() == "true"


def send_login_sms(phone_number: str, user_name: str) -> bool:
    """
    Send a login notification SMS to a user via Kavenegar verify_lookup.

    Args:
        phone_number: User's mobile number (e.g. "09123456789" or "+989123456789")
        user_name: The authenticated user's name (passed as token to template)

    Returns:
        True if SMS was sent successfully, False otherwise.
    """
    if not SMS_ENABLED:
        logger.info(f"SMS disabled — skipping notification for {user_name} ({phone_number})")
        return False

    if not KAVENEGAR_API_KEY:
        logger.warning("KAVENEGAR_API_KEY not set — cannot send SMS")
        return False

    if not phone_number:
        logger.warning(f"No phone number for user {user_name} — skipping SMS")
        return False

    try:
        from kavenegar import KavenegarAPI, APIException, HTTPException

        api = KavenegarAPI(KAVENEGAR_API_KEY)
        params = {
            "receptor": phone_number,
            "template": KAVENEGAR_TEMPLATE,
            "token": user_name,
            "type": "sms",
        }
        response = api.verify_lookup(params)
        logger.info(f"✓ Login SMS sent to {phone_number} for user {user_name}")
        return True

    except Exception as e:
        logger.error(f"✗ Failed to send SMS to {phone_number}: {e}")
        return False

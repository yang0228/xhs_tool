from __future__ import annotations

import base64
import binascii
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EncryptedEnvelope(BaseModel):
    model_config = ConfigDict(extra='forbid')
    ciphertext: str = Field(min_length=24, max_length=2_000_000)
    iv: str = Field(max_length=24)
    salt: str = Field(max_length=64)

    @model_validator(mode='after')
    def valid_envelope(self):
        try:
            lengths = {key: len(base64.b64decode(getattr(self, key), validate=True)) for key in ('ciphertext', 'iv', 'salt')}
        except (binascii.Error, ValueError):
            raise ValueError('Invalid encrypted envelope encoding')
        if lengths['iv'] != 12 or lengths['salt'] != 32 or lengths['ciphertext'] < 16:
            raise ValueError('Invalid AES-GCM envelope')
        return self


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    encrypted_profile: Optional[EncryptedEnvelope]
    expected_version: int = Field(ge=0)


class ProfileResponse(BaseModel):
    encrypted_profile: Optional[EncryptedEnvelope]
    version: int = Field(ge=0)

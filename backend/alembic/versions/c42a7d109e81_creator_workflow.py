"""Add encryption metadata, image ordering and material tags without changing ciphertext."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c42a7d109e81'
down_revision = '9b4d6380411e'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('drafts', sa.Column('content_iv', sa.String(64), nullable=True))
    op.add_column('drafts', sa.Column('encryption_version', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('drafts', sa.Column('image_ids', postgresql.ARRAY(sa.String(36)), nullable=False, server_default='{}'))
    op.add_column('materials', sa.Column('tags', postgresql.ARRAY(sa.String(64)), nullable=False, server_default='{}'))
    # Existing registration creates 12-character prefixes; the initial migration used 8.
    op.alter_column('users', 'api_key_prefix', type_=sa.String(64), existing_type=sa.String(8))
    op.create_index('ix_materials_owner_hash', 'materials', ['user_id', 'content_hash'])


def downgrade():
    op.drop_index('ix_materials_owner_hash', table_name='materials')
    op.drop_column('materials', 'tags')
    op.drop_column('drafts', 'image_ids')
    op.drop_column('drafts', 'encryption_version')
    op.drop_column('drafts', 'content_iv')
    # Do not truncate valid API-key prefixes on downgrade.

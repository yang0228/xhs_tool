"""Add creator profile, topic metadata and immutable publication references."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = 'd18e97ac2140'
down_revision = 'c42a7d109e81'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('encrypted_profile', pg.JSONB(), nullable=True))
    op.add_column('users', sa.Column('profile_version', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('drafts', sa.Column('planned_date', sa.Date(), nullable=True))
    op.add_column('drafts', sa.Column('topic_tags', pg.ARRAY(sa.String(64)), nullable=False, server_default='{}'))
    op.add_column('drafts', sa.Column('encrypted_context', pg.JSONB(), nullable=True))
    op.add_column('published_posts', sa.Column('draft_version', sa.Integer(), nullable=True))
    op.add_column('published_posts', sa.Column('topic_tags', pg.ARRAY(sa.String(64)), nullable=False, server_default='{}'))
    op.add_column('published_posts', sa.Column('template_id', sa.String(16), nullable=True))
    op.add_column('published_posts', sa.Column('image_ids', pg.ARRAY(sa.String(36)), nullable=False, server_default='{}'))


def downgrade():
    for table, columns in [('published_posts', ['image_ids', 'template_id', 'topic_tags', 'draft_version']),
                           ('drafts', ['encrypted_context', 'topic_tags', 'planned_date']),
                           ('users', ['profile_version', 'encrypted_profile'])]:
        for column in columns:
            op.drop_column(table, column)

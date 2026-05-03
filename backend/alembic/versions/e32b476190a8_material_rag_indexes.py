"""Keep RAG document bindings and retryable cleanup tombstones."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = 'e32b476190a8'
down_revision = 'd18e97ac2140'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('material_rag_indexes',
        sa.Column('id', pg.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', pg.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('material_id', pg.UUID(as_uuid=True), nullable=False),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('index_revision', sa.String(128), nullable=False),
        sa.Column('dataset_id', sa.String(128), nullable=False),
        sa.Column('document_id', sa.String(128), nullable=True),
        sa.Column('document_name', sa.String(255), nullable=False),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_material_rag_owner_material', 'material_rag_indexes', ['user_id', 'material_id'])


def downgrade():
    op.drop_table('material_rag_indexes')

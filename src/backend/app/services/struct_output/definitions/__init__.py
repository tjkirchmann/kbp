"""Static structured-output definitions (code-tracked).

Each module here defines a ``StaticDefinition`` subclass and exports a singleton
instance. Importing this package registers them all into ``base.STATIC`` via
``register_static``; the combined resolver (``base.get_definition`` /
``base.all_scheduled``) reads that dict. The resolver imports this package lazily
(see ``base._ensure_static_loaded``) so it never has to be imported by hand.

To add a static definition: create a module here exporting a singleton, then add
an import + ``register_static(...)`` call below.
"""

from app.services.struct_output.base import register_static
from app.services.struct_output.definitions.program_profile import PROGRAM_PROFILE

register_static(PROGRAM_PROFILE)

__all__ = ["PROGRAM_PROFILE"]

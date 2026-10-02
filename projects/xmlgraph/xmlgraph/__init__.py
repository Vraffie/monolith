"""xmlgraph: visualise how the XML files in a repository reference each other."""
from .core import Graph, Node, Edge, scan

__all__ = ["Graph", "Node", "Edge", "scan"]

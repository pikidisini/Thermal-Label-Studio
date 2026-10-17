"""Printer configuration command."""
from app.label_intake.policy import Target
from ..models import Command

class TargetCommand(Command):
    target: Target

"""Upload metadata validation; canonical payload belongs to label_data."""
from app.label_data.validation import shape, text
def validate_upload(value):
    shape(value,{"name","original_filename","payload"})
    for key,limit in (("name",160),("original_filename",255)):
        text(value[key],limit,limit*4)
        if not value[key].strip(): raise ValueError("Invalid upload metadata.")
    return value

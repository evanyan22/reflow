from reflow.classifiers import default_is_media_too_large, default_is_prompt_too_long, default_is_truncated


class FakeError:
    def __init__(self, status=None, code=None, message=None):
        self.status = status
        self.code = code
        self.message = message


def test_matches_anthropic_shaped_too_long_error():
    assert default_is_prompt_too_long(FakeError(status=400, message="prompt is too long: 250000 tokens"))


def test_matches_openai_shaped_context_length_exceeded_by_code():
    assert default_is_prompt_too_long(FakeError(status=400, code="context_length_exceeded", message="nope"))


def test_matches_openai_shaped_message_about_maximum_context_length():
    assert default_is_prompt_too_long(
        FakeError(status=400, message="This model's maximum context length is 128000 tokens.")
    )


def test_does_not_match_unrelated_400_error():
    assert not default_is_prompt_too_long(FakeError(status=400, message="invalid api key"))


def test_does_not_match_non_400_413_status():
    assert not default_is_prompt_too_long(FakeError(status=429, message="prompt is too long"))


def test_matches_oversized_image_shaped_error():
    assert default_is_media_too_large(FakeError(status=400, message="image exceeds size limit"))


def test_does_not_match_media_unrelated_too_large_error():
    assert not default_is_media_too_large(FakeError(status=400, message="prompt is too long"))


def test_detects_anthropic_shaped_truncated_response():
    assert default_is_truncated({"stop_reason": "max_tokens"})


def test_detects_openai_shaped_truncated_response():
    assert default_is_truncated({"choices": [{"finish_reason": "length"}]})


def test_does_not_flag_normal_completed_response():
    assert not default_is_truncated({"stop_reason": "end_turn"})
    assert not default_is_truncated({"choices": [{"finish_reason": "stop"}]})

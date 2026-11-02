import base64
from contextlib import redirect_stdout
import io
import json
import tempfile
import unittest
from pathlib import Path

from botocore.response import StreamingBody
from botocore.stub import Stubber
from PIL import Image

from image_search.main import (
    bedrock_client,
    construct_bedrock_image_body,
    get_embedding_from_titan_multimodal,
    readFileAsBase64,
)


class BedrockCompatibilityTest(unittest.TestCase):
    def test_pillow_image_can_be_encoded_for_the_titan_request(self):
        with tempfile.TemporaryDirectory() as directory:
            image_path = Path(directory) / "sample.png"
            Image.new("RGB", (8, 8), color="red").save(image_path)
            encoded = readFileAsBase64(image_path)
            self.assertEqual(base64.b64decode(encoded), image_path.read_bytes())
            body = json.loads(construct_bedrock_image_body(encoded))
            self.assertEqual(body["inputImage"], encoded)
            self.assertEqual(body["embeddingConfig"]["outputEmbeddingLength"], 1024)

    def test_sdk_request_and_streaming_response_remain_compatible(self):
        body = construct_bedrock_image_body("test-image")
        embedding = [0.1] * 1024
        payload = json.dumps({"embedding": embedding}).encode()
        with Stubber(bedrock_client) as stubber:
            stubber.add_response(
                "invoke_model",
                {
                    "body": StreamingBody(io.BytesIO(payload), len(payload)),
                    "contentType": "application/json",
                },
                {
                    "body": body,
                    "modelId": "amazon.titan-embed-image-v1",
                    "accept": "application/json",
                    "contentType": "application/json",
                },
            )
            with redirect_stdout(io.StringIO()):
                self.assertEqual(get_embedding_from_titan_multimodal(body), embedding)
            stubber.assert_no_pending_responses()


if __name__ == "__main__":
    unittest.main()

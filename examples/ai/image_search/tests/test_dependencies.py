import unittest

import numpy as np
from PIL import Image
from sentence_transformers import SentenceTransformer


class ClipCompatibilityTest(unittest.TestCase):
    def test_image_and_text_share_the_expected_vector_space(self):
        model = SentenceTransformer("clip-ViT-B-32", device="cpu")
        image = Image.new("RGB", (32, 32), color="red")
        image_vector = model.encode(image)
        text_vector = model.encode("a red square")

        for vector in (image_vector, text_vector):
            self.assertEqual(vector.shape, (512,))
            self.assertTrue(np.isfinite(vector).all())
            self.assertGreater(np.linalg.norm(vector), 0)
        np.testing.assert_allclose(model.encode(image), image_vector, rtol=1e-5, atol=1e-5)


if __name__ == "__main__":
    unittest.main()

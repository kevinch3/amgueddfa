from scripts.letras_pendientes import pieces, sung_competitions, title_competitions

PROGRAMA = """## Recitación · Adrodd
26. Para voz femenina: «Poema», Autora Moderna.
## Música · Cerddoriaeth
### Instrumental
40. Piano: «Estudio», Chopin.
### Coros · Corau
70. Côr cymysg: «Anfonaf Angel» [SATB].
71. Prif gystadleuaeth: a) «Cennin Aur» (di-gyfeiliant); b) «Gwinllan», gan R. Jones.
47. Solo libre: «Affanni del pensier», arietta, George F. Händel.
68. Coro familiar: obra a elección.
"""


def test_only_sung_competitions():
    assert sorted(sung_competitions(PROGRAMA)) == [47, 68, 70, 71]


def test_pieces_and_credits():
    c = sung_competitions(PROGRAMA)
    assert pieces(c[70]) == [("Anfonaf Angel", "")]
    assert pieces(c[71]) == [("Cennin Aur", ""), ("Gwinllan", "R. Jones")]
    assert pieces(c[47]) == [("Affanni del pensier", "arietta, George F. Händel")]
    assert pieces(c[68]) == []


def test_title_competitions():
    assert title_competitions("Eisteddfod del Chubut 2025, día sábado. Competencia Nº 75, segunda") == [75]
    assert title_competitions("CAP. 2 EISTEDDFOD DEL CHUBUT 2.025 COMP. 65, 43, 76, 84 Y 59") == [65, 43, 76, 84, 59]
    assert title_competitions("[CH2013068] Comp. Principal: Coro mixto") == [68]
    assert title_competitions("Eisteddfod del chubut 2025") == []
